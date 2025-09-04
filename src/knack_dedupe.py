#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Knack Dedupe by Email (with .env + env var support + server-side filtering)

Features
- Fetch all records from a Knack object (optionally filtered server-side)
- Normalize emails (case-insensitive; optional Gmail dot/+ handling)
- Group by email; keep either oldest or newest
- Dry-run by default; optional CSV backup of duplicates
- Deletes with throttling + basic retry
- Credentials are taken from:
  1) CLI flags --app-id / --api-key
  2) Env vars KNACK_APP_ID / KNACK_API_KEY
  3) .env file (script dir, parent project dir, or CWD)

Supported Objects (with preset configurations):
------------------------------------------------
Object_10 (VESPA Results):       email=field_197,  establishment=field_133, tutor_group=field_223
Object_29 (Questionnaires):      email=field_2732, establishment=field_1821, tutor_group=field_1824
Object_3  (User Accounts):       email=field_70,   establishment=field_122, tutor_group=field_708

Filtering
---------
Use either:
  --establishment VALUE (auto-detects establishment field based on object)
or
  --establishment-field field_XXX --establishment VALUE (explicit field)
or
  --filter-field field_XXX --filter-operator is --filter-value VALUE (generic)

You can also filter by tutor group:
  --tutor-group VALUE (auto-detects tutor group field based on object)

Examples
--------
python knack_dedupe.py --object object_10 --establishment 63bc1c145f917b001289b14e --keep oldest --backup dupes.csv
python knack_dedupe.py --object object_29 --establishment 12345 --tutor-group "A" --keep oldest --apply
python knack_dedupe.py --object object_3 --establishment 686ce50e6b2cd002d1e3f180 --keep oldest --dry-run
"""

import argparse
import csv
import sys
import time
import os
import json
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Tuple, Any, Optional

from dateutil import parser as dtparser
import requests

API_BASE = "https://api.knack.com/v1"

# Object field mappings (for automatic establishment field detection)
OBJECT_FIELD_MAPPINGS = {
    "object_10": {
        "name": "VESPA Results",
        "email_field": "field_197",
        "establishment_field": "field_133",
        "tutor_group_field": "field_223"
    },
    "object_29": {
        "name": "Questionnaire Responses",
        "email_field": "field_2732",
        "establishment_field": "field_1821",
        "tutor_group_field": "field_1824"
    },
    "object_3": {
        "name": "User Accounts",
        "email_field": "field_70",
        "establishment_field": "field_122",
        "tutor_group_field": "field_708"
    }
}

# ---------------------------
# .env / environment handling
# ---------------------------
def load_env_files() -> None:
    """
    Load .env from:
      - Current Working Directory (default dotenv behavior)
      - Script directory
      - Project root (parent of script directory)
    Later calls overwrite earlier only if a key wasn't set yet.
    """
    try:
        from dotenv import load_dotenv
    except Exception:
        return

    # 1) CWD .env (default)
    try:
        load_dotenv()  # silently loads if exists
    except Exception:
        pass

    # 2) Script dir .env
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        dot_script = os.path.join(script_dir, ".env")
        if os.path.isfile(dot_script):
            load_dotenv(dot_script, override=False)
    except Exception:
        pass

    # 3) Project root (one level up)
    try:
        proj_root = os.path.abspath(os.path.join(script_dir, ".."))
        dot_root = os.path.join(proj_root, ".env")
        if os.path.isfile(dot_root):
            load_dotenv(dot_root, override=False)
    except Exception:
        pass


def headers(app_id: str, api_key: str) -> Dict[str, str]:
    return {
        "X-Knack-Application-Id": app_id,
        "X-Knack-REST-API-Key": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def normalize_email(email: str, gmail_normalize: bool = True) -> str:
    if not email:
        return ""
    e = str(email).strip().lower()
    if "@" not in e:
        return e
    local, domain = e.split("@", 1)
    local = local.strip()
    domain = domain.strip()
    # Remove +tag for all domains (conservative generalization)
    if "+" in local:
        local = local.split("+", 1)[0]
    # Gmail dot-insensitivity
    if gmail_normalize and domain in ("gmail.com", "googlemail.com"):
        local = local.replace(".", "")
        domain = "gmail.com"
    return f"{local}@{domain}"


def fetch_all_records(app_id: str, api_key: str, object_key: str,
                      rows_per_page: int = 1000,
                      max_pages: int = 100000,
                      filters: Optional[List[Dict[str, str]]] = None) -> List[Dict[str, Any]]:
    """
    Optionally pass Knack filters, e.g.:
      filters=[{"field":"field_133","operator":"is","value":"12345"}]
    """
    session = requests.Session()
    session.headers.update(headers(app_id, api_key))

    all_records: List[Dict[str, Any]] = []
    page = 1

    while True:
        params = {"rows_per_page": rows_per_page, "page": page}
        if filters:
            # Knack expects JSON-encoded filters in the "filters" query param
            params["filters"] = json.dumps(filters)

        url = f"{API_BASE}/objects/{object_key}/records"
        r = session.get(url, params=params, timeout=60)
        if r.status_code != 200:
            raise RuntimeError(f"Error fetching page {page}: {r.status_code} - {r.text}")
        data = r.json()
        records = data.get("records", [])
        if not records:
            break
        all_records.extend(records)
        page += 1
        if page > max_pages:
            break
        time.sleep(0.2)  # be polite to rate limits
    return all_records


def parse_dt(s: str):
    try:
        return dtparser.parse(s)
    except Exception:
        return None


def choose_record_to_keep(records: List[Dict[str, Any]], keep: str = "oldest") -> Dict[str, Any]:
    def key(rec):
        return parse_dt(rec.get("created_at") or "") or datetime.min

    if keep == "newest":
        return max(records, key=key)
    return min(records, key=key)


def extract_email_value(record: Dict[str, Any], email_field_key: str) -> str:
    """
    Knack email fields can be:
      - simple string
      - dict like {"email": "...", "value": "..."}
      - HTML string like '<a href="mailto:email@example.com">email@example.com</a>'
      - sometimes nested lists (rare)
    """
    import re
    
    raw = record.get(email_field_key)
    
    # Handle simple string
    if isinstance(raw, str):
        # Check if it's HTML formatted email link
        if '<a href="mailto:' in raw:
            # Extract email from HTML link
            match = re.search(r'mailto:([^"]+)"', raw)
            if match:
                return match.group(1)
            # Alternative: extract from link text
            match = re.search(r'>([^<]+@[^<]+)<', raw)
            if match:
                return match.group(1)
        return raw
    
    # Handle dict format
    if isinstance(raw, dict):
        return raw.get("email") or raw.get("value") or ""
    
    # Handle list format
    if isinstance(raw, list) and raw:
        first = raw[0]
        if isinstance(first, dict):
            return first.get("email") or first.get("value") or ""
        if isinstance(first, str):
            # Check for HTML in list item too
            if '<a href="mailto:' in first:
                match = re.search(r'mailto:([^"]+)"', first)
                if match:
                    return match.group(1)
            return first
    return ""


def plan_deletions(records: List[Dict[str, Any]],
                   email_field_key: str,
                   keep: str = "oldest",
                   gmail_normalize: bool = True
                   ) -> Tuple[Dict[str, List[Dict[str, Any]]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for rec in records:
        email_val = extract_email_value(rec, email_field_key)
        norm = normalize_email(email_val or "", gmail_normalize=gmail_normalize)
        if norm:
            groups[norm].append(rec)

    duplicates = {e: recs for e, recs in groups.items() if len(recs) > 1}

    deletions = []
    keepers = []
    for e, recs in duplicates.items():
        keeper = choose_record_to_keep(recs, keep=keep)
        keepers.append(keeper)
        for r in recs:
            if r.get("id") != keeper.get("id"):
                deletions.append({
                    "email_norm": e,
                    "delete_id": r.get("id"),
                    "keep_id": keeper.get("id"),
                    "delete_created_at": r.get("created_at"),
                    "keep_created_at": keeper.get("created_at"),
                    "delete_raw_email": extract_email_value(r, email_field_key),
                    "keep_raw_email": extract_email_value(keeper, email_field_key),
                })
    return duplicates, keepers, deletions


def write_backup_csv(path: str,
                     duplicates: Dict[str, List[Dict[str, Any]]],
                     email_field_key: str) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["email_group", "record_id", "created_at", "updated_at", "raw_email"])
        for email_norm, recs in duplicates.items():
            for r in recs:
                raw_email = extract_email_value(r, email_field_key)
                w.writerow([
                    email_norm,
                    r.get("id") or "",
                    r.get("created_at") or "",
                    r.get("updated_at") or "",
                    raw_email or ""
                ])


def delete_records(app_id: str, api_key: str, object_key: str,
                   deletion_plan: List[Dict[str, Any]]) -> Tuple[int, int]:
    session = requests.Session()
    session.headers.update(headers(app_id, api_key))

    deleted = 0
    errors = 0

    for i, item in enumerate(deletion_plan, 1):
        rec_id = item["delete_id"]
        url = f"{API_BASE}/objects/{object_key}/records/{rec_id}"

        try:
            r = session.delete(url, timeout=60)
            if r.status_code in (200, 204):
                deleted += 1
                print(f"[{i}/{len(deletion_plan)}] Deleted {rec_id} (email group: {item['email_norm']})")
            else:
                errors += 1
                print(f"[{i}/{len(deletion_plan)}] ERROR deleting {rec_id}: {r.status_code} - {r.text}")
        except requests.RequestException as e:
            errors += 1
            print(f"[{i}/{len(deletion_plan)}] EXCEPTION deleting {rec_id}: {e}")

        time.sleep(0.25)  # throttle
    return deleted, errors


def main():
    load_env_files()

    ap = argparse.ArgumentParser(
        description="Dedupe Knack records by email and delete duplicates.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Supported Objects (with auto-detected fields):
  object_10 (VESPA Results):      email=field_197,  establishment=field_133, tutor_group=field_223
  object_29 (Questionnaires):     email=field_2732, establishment=field_1821, tutor_group=field_1824
  object_3  (User Accounts):      email=field_70,   establishment=field_122, tutor_group=field_708

Examples:
  # Dry run with backup
  python knack_dedupe.py --object object_10 --establishment 63bc1c145f917b001289b14e --backup dupes.csv
  
  # Apply deletions with tutor group filter
  python knack_dedupe.py --object object_29 --establishment 12345 --tutor-group "A" --apply
  
  # Keep newest records
  python knack_dedupe.py --object object_3 --establishment 686ce50e6b2cd002d1e3f180 --keep newest --apply
        """
    )
    ap.add_argument("--app-id", help="Knack Application ID (or set KNACK_APP_ID / .env)")
    ap.add_argument("--api-key", help="Knack REST API Key (or set KNACK_API_KEY / .env)")
    ap.add_argument("--object", required=True, dest="object_key", help="Object key, e.g. object_10")
    ap.add_argument("--email-field", dest="email_field_key", 
                    help="Email field key (auto-detected for known objects)")
    ap.add_argument("--keep", choices=["oldest", "newest"], default="oldest",
                    help="Which record to keep in each duplicate group (default: oldest)")
    ap.add_argument("--apply", action="store_true",
                    help="Actually delete the duplicates. Omit for a dry run.")
    ap.add_argument("--dry-run", action="store_true",
                    help="Alias for not using --apply (shows what would be deleted)")
    ap.add_argument("--backup", default=None,
                    help="Path to CSV where duplicates will be saved (dry run or before deletion)")
    ap.add_argument("--no-gmail-normalize", action="store_true",
                    help="Disable Gmail-specific normalization (dot/plus handling)")
    # Server-side filters
    ap.add_argument("--establishment", default=None,
                    help="Filter by establishment ID (auto-detects field based on object)")
    ap.add_argument("--tutor-group", default=None,
                    help="Filter by tutor group (auto-detects field based on object)")
    ap.add_argument("--establishment-field", default=None,
                    help="Explicit establishment field key (overrides auto-detection)")
    ap.add_argument("--filter-field", default=None,
                    help="Generic filter field key")
    ap.add_argument("--filter-operator", default="is",
                    help="Generic filter operator (is, contains, in, etc.)")
    ap.add_argument("--filter-value", default=None,
                    help="Generic filter value")
    ap.add_argument("--verbose", "-v", action="store_true",
                    help="Verbose output")
    args = ap.parse_args()

    # Fill from env if flags missing
    app_id = args.app_id or os.getenv("KNACK_APP_ID")
    api_key = args.api_key or os.getenv("KNACK_API_KEY")

    if not app_id or not api_key:
        print("ERROR: Missing Knack credentials.")
        print("Provide --app-id/--api-key or set KNACK_APP_ID/KNACK_API_KEY (via env or .env).")
        sys.exit(2)

    # Auto-detect email field if not provided
    if args.object_key in OBJECT_FIELD_MAPPINGS and not args.email_field_key:
        args.email_field_key = OBJECT_FIELD_MAPPINGS[args.object_key]["email_field"]
        obj_name = OBJECT_FIELD_MAPPINGS[args.object_key]["name"]
        print(f"Auto-detected email field for {args.object_key} ({obj_name}): {args.email_field_key}")
    
    if not args.email_field_key:
        print("ERROR: --email-field is required for unknown objects.")
        print(f"Known objects: {', '.join(OBJECT_FIELD_MAPPINGS.keys())}")
        sys.exit(2)

    # Build filters
    filters = []
    
    # Add establishment filter
    if args.establishment:
        # Determine establishment field
        est_field = args.establishment_field
        if not est_field and args.object_key in OBJECT_FIELD_MAPPINGS:
            est_field = OBJECT_FIELD_MAPPINGS[args.object_key]["establishment_field"]
            if args.verbose:
                obj_name = OBJECT_FIELD_MAPPINGS[args.object_key]["name"]
                print(f"Auto-detected establishment field for {args.object_key} ({obj_name}): {est_field}")
        elif not est_field:
            print("ERROR: --establishment-field required for unknown objects when using --establishment")
            print(f"Known objects: {', '.join(OBJECT_FIELD_MAPPINGS.keys())}")
            sys.exit(2)
        
        filters.append({"field": est_field, "operator": "is", "value": args.establishment})
    
    # Add tutor group filter
    if args.tutor_group:
        if args.object_key in OBJECT_FIELD_MAPPINGS and "tutor_group_field" in OBJECT_FIELD_MAPPINGS[args.object_key]:
            tutor_field = OBJECT_FIELD_MAPPINGS[args.object_key]["tutor_group_field"]
            filters.append({"field": tutor_field, "operator": "is", "value": args.tutor_group})
            if args.verbose:
                print(f"Auto-detected tutor group field: {tutor_field}")
        else:
            print(f"WARNING: Tutor group filter not available for {args.object_key}")
    
    # Add generic filter if specified
    if args.filter_field and args.filter_value:
        filters.append({"field": args.filter_field, "operator": args.filter_operator, "value": args.filter_value})
    
    # Convert to None if no filters
    if not filters:
        filters = None

    if filters:
        print(f"Applying server-side filters: {filters}")

    print("Fetching records…")
    try:
        records = fetch_all_records(app_id, api_key, args.object_key, filters=filters)
    except Exception as e:
        print(f"Failed to fetch records: {e}")
        sys.exit(1)

    obj_name = OBJECT_FIELD_MAPPINGS.get(args.object_key, {}).get("name", args.object_key)
    print(f"Fetched {len(records)} records from {args.object_key} ({obj_name}).")
    
    if len(records) == 0:
        print("\nNo records found matching the criteria.")
        if filters:
            print("Check your filter values - the establishment ID might be incorrect.")
        return

    duplicates, keepers, deletions = plan_deletions(
        records,
        email_field_key=args.email_field_key,
        keep=args.keep,
        gmail_normalize=not args.no_gmail_normalize
    )

    dup_groups = len(duplicates)
    to_delete = len(deletions)
    total_records_in_dups = sum(len(recs) for recs in duplicates.values())

    if args.backup:
        try:
            write_backup_csv(args.backup, duplicates, args.email_field_key)
            print(f"✓ Wrote duplicate groups to {args.backup}")
        except Exception as e:
            print(f"WARNING: Could not write backup CSV: {e}")

    print("\n" + "="*60)
    print("DEDUPLICATION SUMMARY")
    print("="*60)
    print(f"Object:                  {args.object_key} ({obj_name})")
    print(f"Total records fetched:   {len(records)}")
    print(f"Duplicate email groups:  {dup_groups}")
    print(f"Records in duplicates:   {total_records_in_dups}")
    print(f"Records to delete:       {to_delete}")
    print(f"Records to keep:         {len(keepers)}")
    print(f"Keep strategy:           {args.keep}")
    
    if filters:
        for f in filters:
            field_name = f['field']
            if field_name == OBJECT_FIELD_MAPPINGS.get(args.object_key, {}).get("establishment_field"):
                print(f"Establishment filter:    {field_name} = {f['value']}")
            elif field_name == OBJECT_FIELD_MAPPINGS.get(args.object_key, {}).get("tutor_group_field"):
                print(f"Tutor group filter:      {field_name} = {f['value']}")
            else:
                print(f"Filter applied:          {field_name} {f.get('operator', '=')} {f['value']}")
    
    if to_delete:
        print("\n" + "-"*60)
        print("EXAMPLE DELETIONS (showing first 3):")
        print("-"*60)
        for i, example in enumerate(deletions[:3], 1):
            print(f"\nExample {i}:")
            print(f"  Email (normalized): {example['email_norm']}")
            keep_date = example['keep_created_at'][:10] if example['keep_created_at'] else "N/A"
            delete_date = example['delete_created_at'][:10] if example['delete_created_at'] else "N/A"
            print(f"  Keep ID:           {example['keep_id']} (created {keep_date})")
            print(f"  Delete ID:         {example['delete_id']} (created {delete_date})")
            if example['delete_raw_email'] != example['keep_raw_email']:
                print(f"  Raw emails differ: '{example['delete_raw_email']}' vs '{example['keep_raw_email']}'")
    else:
        print("\n✓ No duplicates found!")

    # Check if dry run
    if args.dry_run or not args.apply:
        print("\n" + "="*60)
        print("DRY RUN MODE - No records were deleted")
        print("="*60)
        if to_delete:
            print("\nTo actually delete these duplicates, re-run with --apply")
            cmd_parts = ["python knack_dedupe.py", f"--object {args.object_key}"]
            if args.establishment:
                cmd_parts.append(f"--establishment {args.establishment}")
            if args.tutor_group:
                cmd_parts.append(f'--tutor-group "{args.tutor_group}"')
            cmd_parts.append("--apply")
            print(f"Command: {' '.join(cmd_parts)}")
        return

    if to_delete == 0:
        return

    # Extra confirmation for actual deletion
    print("\n" + "!"*60)
    print(f"WARNING: About to delete {to_delete} records!")
    print("!"*60)
    confirm = input("\nType 'DELETE' to confirm deletion (or anything else to abort): ").strip()
    if confirm != "DELETE":
        print("Aborted - no records were deleted.")
        return

    print("\nDeleting duplicates...")
    deleted, errors = delete_records(app_id, api_key, args.object_key, deletions)
    
    print("\n" + "="*60)
    print("DELETION COMPLETE")
    print("="*60)
    print(f"Successfully deleted: {deleted}")
    print(f"Errors encountered:   {errors}")
    
    if errors > 0:
        print("\n⚠ Some deletions failed. Check the error messages above.")
    else:
        print("\n✓ All duplicates successfully removed!")


if __name__ == "__main__":
    main()
