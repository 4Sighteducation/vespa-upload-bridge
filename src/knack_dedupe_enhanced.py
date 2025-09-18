#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Enhanced Knack Dedupe - Handles duplicates by email OR connection field
Specifically designed to handle Object_29 duplicates with empty emails

Features:
- Can dedupe by email (when present) OR by connection field (when email is empty)
- For Object_29: Uses field_792 (connection to Object_10) when email is blank
- Maintains all original functionality for email-based deduplication
- Server-side filtering support
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

# Object field mappings with connection fields
OBJECT_FIELD_MAPPINGS = {
    "object_10": {
        "name": "VESPA Results",
        "email_field": "field_197",
        "establishment_field": "field_133",
        "tutor_group_field": "field_223",
        "connection_field": None  # Object_10 doesn't connect to another object for dedup
    },
    "object_29": {
        "name": "Questionnaire Responses",
        "email_field": "field_2732",
        "establishment_field": "field_1821",
        "tutor_group_field": "field_1824",
        "connection_field": "field_792"  # Connection to Object_10
    },
    "object_3": {
        "name": "User Accounts",
        "email_field": "field_70",
        "establishment_field": "field_122",
        "tutor_group_field": "field_708",
        "connection_field": None
    }
}

# ---------------------------
# .env / environment handling
# ---------------------------
def load_env_files() -> None:
    """Load .env files from multiple locations"""
    try:
        from dotenv import load_dotenv
    except Exception:
        return

    # 1) CWD .env (default)
    try:
        load_dotenv()
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
    # Remove +tag for all domains
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
    """Fetch all records with optional server-side filtering"""
    session = requests.Session()
    session.headers.update(headers(app_id, api_key))

    all_records: List[Dict[str, Any]] = []
    page = 1

    while True:
        params = {"rows_per_page": rows_per_page, "page": page}
        if filters:
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
        time.sleep(0.2)
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
    """Extract email from various Knack field formats"""
    import re
    
    raw = record.get(email_field_key)
    
    # Handle simple string
    if isinstance(raw, str):
        # Check if it's HTML formatted email link
        if '<a href="mailto:' in raw:
            match = re.search(r'mailto:([^"]+)"', raw)
            if match:
                return match.group(1)
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
            if '<a href="mailto:' in first:
                match = re.search(r'mailto:([^"]+)"', first)
                if match:
                    return match.group(1)
            return first
    return ""


def extract_connection_value(record: Dict[str, Any], connection_field_key: str) -> str:
    """Extract connection field value (usually an ID or array of IDs)"""
    raw = record.get(connection_field_key)
    
    # Handle simple string (single connection ID)
    if isinstance(raw, str):
        return raw
    
    # Handle list of connections
    if isinstance(raw, list) and raw:
        # Join multiple connection IDs with a separator
        ids = []
        for item in raw:
            if isinstance(item, str):
                ids.append(item)
            elif isinstance(item, dict) and item.get("id"):
                ids.append(item["id"])
        return ",".join(sorted(ids))  # Sort for consistent grouping
    
    # Handle dict with ID
    if isinstance(raw, dict) and raw.get("id"):
        return raw["id"]
    
    return ""


def plan_deletions_enhanced(records: List[Dict[str, Any]],
                           email_field_key: str,
                           connection_field_key: Optional[str] = None,
                           keep: str = "oldest",
                           gmail_normalize: bool = True
                           ) -> Tuple[Dict[str, List[Dict[str, Any]]], List[Dict[str, Any]], List[Dict[str, Any]], int, int]:
    """
    Enhanced deduplication that handles both email and connection-based duplicates.
    Returns: (duplicates, keepers, deletions, records_with_empty_email, connection_duplicates_count)
    """
    email_groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    connection_groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    records_with_empty_email = 0
    
    for rec in records:
        email_val = extract_email_value(rec, email_field_key)
        norm_email = normalize_email(email_val or "", gmail_normalize=gmail_normalize)
        
        if norm_email:
            # Has email - group by email
            email_groups[norm_email].append(rec)
        else:
            # No email - try to group by connection field if available
            records_with_empty_email += 1
            if connection_field_key:
                conn_val = extract_connection_value(rec, connection_field_key)
                if conn_val:
                    connection_groups[conn_val].append(rec)

    # Find duplicates in both groups
    email_duplicates = {e: recs for e, recs in email_groups.items() if len(recs) > 1}
    connection_duplicates = {c: recs for c, recs in connection_groups.items() if len(recs) > 1}
    
    # Combine all duplicates (using a unique key for each group)
    all_duplicates = {}
    for email, recs in email_duplicates.items():
        all_duplicates[f"email:{email}"] = recs
    for conn, recs in connection_duplicates.items():
        all_duplicates[f"connection:{conn}"] = recs

    deletions = []
    keepers = []
    
    for key, recs in all_duplicates.items():
        keeper = choose_record_to_keep(recs, keep=keep)
        keepers.append(keeper)
        for r in recs:
            if r.get("id") != keeper.get("id"):
                # Determine what field was used for grouping
                if key.startswith("email:"):
                    group_type = "email"
                    group_value = key[6:]  # Remove "email:" prefix
                else:
                    group_type = "connection"
                    group_value = key[11:]  # Remove "connection:" prefix
                
                deletions.append({
                    "group_type": group_type,
                    "group_value": group_value,
                    "delete_id": r.get("id"),
                    "keep_id": keeper.get("id"),
                    "delete_created_at": r.get("created_at"),
                    "keep_created_at": keeper.get("created_at"),
                    "delete_raw_email": extract_email_value(r, email_field_key),
                    "keep_raw_email": extract_email_value(keeper, email_field_key),
                })
    
    return all_duplicates, keepers, deletions, records_with_empty_email, len(connection_duplicates)


def write_backup_csv(path: str,
                     duplicates: Dict[str, List[Dict[str, Any]]],
                     email_field_key: str,
                     connection_field_key: Optional[str] = None) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        headers = ["group_type", "group_value", "record_id", "created_at", "updated_at", "raw_email"]
        if connection_field_key:
            headers.append("connection_field")
        w.writerow(headers)
        
        for key, recs in duplicates.items():
            group_type = "email" if key.startswith("email:") else "connection"
            group_value = key.split(":", 1)[1] if ":" in key else key
            
            for r in recs:
                row = [
                    group_type,
                    group_value,
                    r.get("id") or "",
                    r.get("created_at") or "",
                    r.get("updated_at") or "",
                    extract_email_value(r, email_field_key) or ""
                ]
                if connection_field_key:
                    row.append(extract_connection_value(r, connection_field_key) or "")
                w.writerow(row)


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
                group_info = f"{item['group_type']}:{item['group_value']}"
                print(f"[{i}/{len(deletion_plan)}] Deleted {rec_id} (group: {group_info})")
            else:
                errors += 1
                print(f"[{i}/{len(deletion_plan)}] ERROR deleting {rec_id}: {r.status_code} - {r.text}")
        except requests.RequestException as e:
            errors += 1
            print(f"[{i}/{len(deletion_plan)}] EXCEPTION deleting {rec_id}: {e}")

        time.sleep(0.25)
    return deleted, errors


def main():
    load_env_files()

    ap = argparse.ArgumentParser(
        description="Enhanced Knack deduplication - handles duplicates by email OR connection field",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Supported Objects (with auto-detected fields):
  object_10 (VESPA Results):      email=field_197,  establishment=field_133
  object_29 (Questionnaires):     email=field_2732, establishment=field_1821, connection=field_792
  object_3  (User Accounts):      email=field_70,   establishment=field_122

Special handling for Object_29:
  - Dedupes by email when present
  - Dedupes by connection to Object_10 (field_792) when email is empty
  - This catches duplicates that have blank emails but duplicate connections

Examples:
  # Standard deduplication by email
  python knack_dedupe_enhanced.py --object object_10 --establishment 63bc1c145f917b001289b14e --apply
  
  # Object_29 with connection-based deduplication for blank emails
  python knack_dedupe_enhanced.py --object object_29 --establishment 66685bc1166258a00295f0340 --apply
  
  # Force connection-only deduplication
  python knack_dedupe_enhanced.py --object object_29 --establishment 66685bc1166258a00295f0340 --connection-only --apply
        """
    )
    ap.add_argument("--app-id", help="Knack Application ID (or set KNACK_APP_ID / .env)")
    ap.add_argument("--api-key", help="Knack REST API Key (or set KNACK_API_KEY / .env)")
    ap.add_argument("--object", required=True, dest="object_key", help="Object key, e.g. object_10")
    ap.add_argument("--email-field", dest="email_field_key", 
                    help="Email field key (auto-detected for known objects)")
    ap.add_argument("--connection-field", dest="connection_field_key",
                    help="Connection field key for deduping records with empty emails")
    ap.add_argument("--connection-only", action="store_true",
                    help="Only dedupe by connection field, ignore email field")
    ap.add_argument("--keep", choices=["oldest", "newest"], default="oldest",
                    help="Which record to keep in each duplicate group (default: oldest)")
    ap.add_argument("--apply", action="store_true",
                    help="Actually delete the duplicates. Omit for a dry run.")
    ap.add_argument("--dry-run", action="store_true",
                    help="Alias for not using --apply (shows what would be deleted)")
    ap.add_argument("--backup", default=None,
                    help="Path to CSV where duplicates will be saved")
    ap.add_argument("--no-gmail-normalize", action="store_true",
                    help="Disable Gmail-specific normalization")
    # Filters
    ap.add_argument("--establishment", default=None,
                    help="Filter by establishment ID")
    ap.add_argument("--tutor-group", default=None,
                    help="Filter by tutor group")
    ap.add_argument("--establishment-field", default=None,
                    help="Explicit establishment field key")
    ap.add_argument("--filter-field", default=None,
                    help="Generic filter field key")
    ap.add_argument("--filter-operator", default="is",
                    help="Generic filter operator")
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

    # Auto-detect fields if not provided
    if args.object_key in OBJECT_FIELD_MAPPINGS:
        mapping = OBJECT_FIELD_MAPPINGS[args.object_key]
        
        if not args.email_field_key and not args.connection_only:
            args.email_field_key = mapping["email_field"]
            print(f"Auto-detected email field for {args.object_key} ({mapping['name']}): {args.email_field_key}")
        
        if not args.connection_field_key and mapping.get("connection_field"):
            args.connection_field_key = mapping["connection_field"]
            print(f"Auto-detected connection field for {args.object_key}: {args.connection_field_key}")
    
    # Handle connection-only mode
    if args.connection_only:
        if not args.connection_field_key:
            print("ERROR: --connection-field required when using --connection-only")
            sys.exit(2)
        args.email_field_key = "field_dummy_never_exists"  # Use a dummy field that won't match
    
    if not args.email_field_key:
        print("ERROR: --email-field is required for unknown objects.")
        sys.exit(2)

    # Build filters
    filters = []
    
    if args.establishment:
        est_field = args.establishment_field
        if not est_field and args.object_key in OBJECT_FIELD_MAPPINGS:
            est_field = OBJECT_FIELD_MAPPINGS[args.object_key]["establishment_field"]
            if args.verbose:
                print(f"Auto-detected establishment field: {est_field}")
        elif not est_field:
            print("ERROR: --establishment-field required for unknown objects")
            sys.exit(2)
        
        filters.append({"field": est_field, "operator": "is", "value": args.establishment})
    
    if args.tutor_group:
        if args.object_key in OBJECT_FIELD_MAPPINGS and "tutor_group_field" in OBJECT_FIELD_MAPPINGS[args.object_key]:
            tutor_field = OBJECT_FIELD_MAPPINGS[args.object_key]["tutor_group_field"]
            filters.append({"field": tutor_field, "operator": "is", "value": args.tutor_group})
    
    if args.filter_field and args.filter_value:
        filters.append({"field": args.filter_field, "operator": args.filter_operator, "value": args.filter_value})
    
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

    # Use enhanced deduplication
    duplicates, keepers, deletions, empty_email_count, conn_dup_count = plan_deletions_enhanced(
        records,
        email_field_key=args.email_field_key,
        connection_field_key=args.connection_field_key,
        keep=args.keep,
        gmail_normalize=not args.no_gmail_normalize
    )

    # Count different types of duplicates
    email_dup_count = len([k for k in duplicates.keys() if k.startswith("email:")])
    connection_dup_count = len([k for k in duplicates.keys() if k.startswith("connection:")])
    
    dup_groups = len(duplicates)
    to_delete = len(deletions)
    total_records_in_dups = sum(len(recs) for recs in duplicates.values())

    if args.backup:
        try:
            write_backup_csv(args.backup, duplicates, args.email_field_key, args.connection_field_key)
            print(f"✓ Wrote duplicate groups to {args.backup}")
        except Exception as e:
            print(f"WARNING: Could not write backup CSV: {e}")

    print("\n" + "="*60)
    print("ENHANCED DEDUPLICATION SUMMARY")
    print("="*60)
    print(f"Object:                     {args.object_key} ({obj_name})")
    print(f"Total records fetched:      {len(records)}")
    print(f"Records with empty email:   {empty_email_count}")
    print(f"Duplicate groups (total):   {dup_groups}")
    print(f"  - Email duplicates:       {email_dup_count}")
    print(f"  - Connection duplicates:  {connection_dup_count}")
    print(f"Records in duplicates:      {total_records_in_dups}")
    print(f"Records to delete:          {to_delete}")
    print(f"Records to keep:            {len(keepers)}")
    print(f"Keep strategy:              {args.keep}")
    
    if filters:
        for f in filters:
            field_name = f['field']
            if field_name == OBJECT_FIELD_MAPPINGS.get(args.object_key, {}).get("establishment_field"):
                print(f"Establishment filter:       {field_name} = {f['value']}")
            elif field_name == OBJECT_FIELD_MAPPINGS.get(args.object_key, {}).get("tutor_group_field"):
                print(f"Tutor group filter:         {field_name} = {f['value']}")
            else:
                print(f"Filter applied:             {field_name} {f.get('operator', '=')} {f['value']}")
    
    if to_delete:
        print("\n" + "-"*60)
        print("EXAMPLE DELETIONS (showing first 5):")
        print("-"*60)
        for i, example in enumerate(deletions[:5], 1):
            print(f"\nExample {i}:")
            print(f"  Duplicate type:     {example['group_type']}")
            if example['group_type'] == "email":
                print(f"  Email (normalized): {example['group_value']}")
            else:
                print(f"  Connection ID:      {example['group_value']}")
            
            keep_date = example['keep_created_at'][:10] if example['keep_created_at'] else "N/A"
            delete_date = example['delete_created_at'][:10] if example['delete_created_at'] else "N/A"
            print(f"  Keep ID:           {example['keep_id']} (created {keep_date})")
            print(f"  Delete ID:         {example['delete_id']} (created {delete_date})")
            
            if example['delete_raw_email'] or example['keep_raw_email']:
                print(f"  Emails:            '{example['delete_raw_email']}' vs '{example['keep_raw_email']}'")
    else:
        print("\n✓ No duplicates found!")

    # Check if dry run
    if args.dry_run or not args.apply:
        print("\n" + "="*60)
        print("DRY RUN MODE - No records were deleted")
        print("="*60)
        if to_delete:
            print("\nTo actually delete these duplicates, re-run with --apply")
            cmd_parts = ["python knack_dedupe_enhanced.py", f"--object {args.object_key}"]
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
    print("\nThis includes:")
    email_deletes = len([d for d in deletions if d['group_type'] == 'email'])
    conn_deletes = len([d for d in deletions if d['group_type'] == 'connection'])
    print(f"  - {email_deletes} email-based duplicates")
    print(f"  - {conn_deletes} connection-based duplicates (records with blank emails)")
    
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
