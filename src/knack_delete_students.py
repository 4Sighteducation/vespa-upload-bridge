#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Knack Delete Students - Delete student records with multiple filtering options

Two deletion modes:
1. ALL STUDENT DATA: Delete Object_3 accounts with ONLY "Student" role,
   plus all related records in Object_10, Object_29, Object_113 by email
2. QUESTIONNAIRE DATA: Delete only Object_10 & Object_29 records

Features:
- Establishment lookup by name or ID
- Filter by establishment, year group, and tutor group
- Dry-run mode for safety
- CSV backup of deleted records
- Detailed deletion report

Object Configurations:
---------------------
Object_3 (User Accounts):
  - field_70: Email
  - field_73: Role (check for ONLY "Student")
  - field_122: Establishment
  - field_550: Year group
  - field_708: Tutor group

Object_10 (VESPA Results):
  - field_197: Email
  - field_133: Establishment
  - field_144: Year group
  - field_223: Tutor group

Object_29 (Questionnaires):
  - field_2732: Email
  - field_1821: Establishment
  - field_1826: Year group
  - field_1824: Tutor group

Object_113:
  - field_3130: Email

Examples:
--------
# Delete all student data for an establishment (by name)
python knack_delete_students.py --mode all-student-data --establishment "Springfield High" --apply

# Delete questionnaire data for Year 11, Group A
python knack_delete_students.py --mode questionnaire-data --establishment 12345 --year-group "Year 11" --tutor-group "A" --apply

# Dry run with backup
python knack_delete_students.py --mode all-student-data --establishment "Springfield High" --backup students_to_delete.csv
"""

import argparse
import csv
import sys
import time
import os
import json
import re
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Tuple, Any, Optional, Set

import requests
from dateutil import parser as dtparser

# Import establishment lookup utility
try:
    from knack_establishment_lookup import get_establishment_id, load_env_files
except ImportError:
    # Fallback if module not found - define locally
    def get_establishment_id(app_id: str, api_key: str, identifier: str) -> Optional[str]:
        """Simple fallback - assumes identifier is already an ID"""
        import re
        # Check for 24-char hex ID or numeric ID
        if re.match(r'^[a-f0-9]{24}$', identifier.lower()) or identifier.isdigit():
            return identifier
        print(f"WARNING: Could not lookup establishment name '{identifier}'")
        print("Please use the establishment ID instead")
        return None
    
    def load_env_files():
        try:
            from dotenv import load_dotenv
            load_dotenv()
        except:
            pass

API_BASE = "https://api.knack.com/v1"

# Object field mappings
OBJECT_CONFIGS = {
    "object_3": {
        "name": "User Accounts",
        "email_field": "field_70",
        "role_field": "field_73",
        "establishment_field": "field_122",
        "year_group_field": "field_550",
        "tutor_group_field": "field_708"
    },
    "object_10": {
        "name": "VESPA Results",
        "email_field": "field_197",
        "establishment_field": "field_133",
        "year_group_field": "field_144",
        "tutor_group_field": "field_223"
    },
    "object_29": {
        "name": "Questionnaire Responses",
        "email_field": "field_2732",
        "establishment_field": "field_1821",
        "year_group_field": "field_1826",
        "tutor_group_field": "field_1824"
    },
    "object_113": {
        "name": "Object_113 Records",
        "email_field": "field_3130"
    }
}


def headers(app_id: str, api_key: str) -> Dict[str, str]:
    """Generate API headers"""
    return {
        "X-Knack-Application-Id": app_id,
        "X-Knack-REST-API-Key": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def extract_email_value(record: Dict[str, Any], email_field_key: str) -> str:
    """
    Extract email from various Knack field formats
    """
    import re
    
    raw = record.get(email_field_key)
    
    # Handle simple string
    if isinstance(raw, str):
        # Check if it's HTML formatted email link
        if '<a href="mailto:' in raw:
            match = re.search(r'mailto:([^"]+)"', raw)
            if match:
                return match.group(1).strip().lower()
            match = re.search(r'>([^<]+@[^<]+)<', raw)
            if match:
                return match.group(1).strip().lower()
        return raw.strip().lower()
    
    # Handle dict format
    if isinstance(raw, dict):
        email = raw.get("email") or raw.get("value") or ""
        return email.strip().lower()
    
    # Handle list format
    if isinstance(raw, list) and raw:
        first = raw[0]
        if isinstance(first, dict):
            email = first.get("email") or first.get("value") or ""
            return email.strip().lower()
        if isinstance(first, str):
            if '<a href="mailto:' in first:
                match = re.search(r'mailto:([^"]+)"', first)
                if match:
                    return match.group(1).strip().lower()
            return first.strip().lower()
    
    return ""


def check_student_only_role(record: Dict[str, Any], role_field: str) -> bool:
    """
    Check if record has ONLY "Student" role (not multiple roles)
    Returns True if the only role is Student
    """
    role_value = record.get(role_field)
    
    if not role_value:
        return False
    
    # Handle different formats
    if isinstance(role_value, str):
        # Clean up any HTML
        role_clean = re.sub('<.*?>', '', role_value).strip()
        # Check if it's exactly "Student" (case-insensitive)
        return role_clean.lower() == "student"
    
    if isinstance(role_value, list):
        # If it's a list, check if it only contains one item and it's "Student"
        if len(role_value) == 1:
            role_item = role_value[0]
            if isinstance(role_item, str):
                return role_item.strip().lower() == "student"
            elif isinstance(role_item, dict):
                # Sometimes roles come as {"identifier": "student", "value": "Student"}
                val = role_item.get("value") or role_item.get("identifier") or ""
                return val.strip().lower() == "student"
        return False  # Multiple roles
    
    if isinstance(role_value, dict):
        val = role_value.get("value") or role_value.get("identifier") or ""
        return val.strip().lower() == "student"
    
    return False


def fetch_all_records(app_id: str, api_key: str, object_key: str,
                      filters: Optional[List[Dict[str, str]]] = None,
                      rows_per_page: int = 1000,
                      max_pages: int = 100000) -> List[Dict[str, Any]]:
    """Fetch all records from a Knack object with optional filters"""
    session = requests.Session()
    session.headers.update(headers(app_id, api_key))
    
    all_records = []
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
        
        time.sleep(0.2)  # Rate limiting
    
    return all_records


def delete_record(app_id: str, api_key: str, object_key: str, record_id: str,
                  session: Optional[requests.Session] = None) -> bool:
    """Delete a single record"""
    if not session:
        session = requests.Session()
        session.headers.update(headers(app_id, api_key))
    
    url = f"{API_BASE}/objects/{object_key}/records/{record_id}"
    
    try:
        r = session.delete(url, timeout=60)
        return r.status_code in (200, 204)
    except requests.RequestException:
        return False


def write_backup_csv(path: str, records_by_object: Dict[str, List[Dict[str, Any]]]) -> None:
    """Write backup CSV with all records to be deleted"""
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["object", "record_id", "email", "created_at", "additional_info"])
        
        for object_key, records in records_by_object.items():
            config = OBJECT_CONFIGS.get(object_key, {})
            email_field = config.get("email_field")
            
            for rec in records:
                email = ""
                if email_field:
                    email = extract_email_value(rec, email_field)
                
                # Build additional info
                info_parts = []
                if object_key == "object_3" and config.get("role_field"):
                    role = rec.get(config["role_field"])
                    if role:
                        info_parts.append(f"role={role}")
                
                if config.get("year_group_field"):
                    year_group = rec.get(config["year_group_field"])
                    if year_group:
                        info_parts.append(f"year={year_group}")
                
                if config.get("tutor_group_field"):
                    tutor_group = rec.get(config["tutor_group_field"])
                    if tutor_group:
                        info_parts.append(f"group={tutor_group}")
                
                additional_info = "; ".join(info_parts)
                
                w.writerow([
                    object_key,
                    rec.get("id", ""),
                    email,
                    rec.get("created_at", ""),
                    additional_info
                ])


def delete_all_student_data(app_id: str, api_key: str, 
                           establishment_id: Optional[str] = None,
                           year_group: Optional[str] = None,
                           tutor_group: Optional[str] = None,
                           dry_run: bool = True,
                           backup_path: Optional[str] = None,
                           verbose: bool = False) -> Dict[str, Any]:
    """
    Mode 1: Delete all student data
    - Find Object_3 accounts with ONLY "Student" role
    - Delete related records in Object_10, Object_29, Object_113 by email
    """
    results = {
        "mode": "all-student-data",
        "filters": {
            "establishment": establishment_id,
            "year_group": year_group,
            "tutor_group": tutor_group
        },
        "found": {},
        "deleted": {},
        "errors": {},
        "emails": set()
    }
    
    session = requests.Session()
    session.headers.update(headers(app_id, api_key))
    
    # Step 1: Find Object_3 student-only accounts
    print("\n" + "="*60)
    print("Step 1: Finding student-only accounts in Object_3...")
    print("="*60)
    
    config = OBJECT_CONFIGS["object_3"]
    filters = []
    
    if establishment_id:
        filters.append({
            "field": config["establishment_field"],
            "operator": "is",
            "value": establishment_id
        })
    
    if year_group:
        filters.append({
            "field": config["year_group_field"],
            "operator": "is",
            "value": year_group
        })
    
    if tutor_group:
        filters.append({
            "field": config["tutor_group_field"],
            "operator": "is",
            "value": tutor_group
        })
    
    if verbose and filters:
        print(f"Filters: {filters}")
    
    try:
        all_obj3_records = fetch_all_records(app_id, api_key, "object_3", filters=filters)
        print(f"Found {len(all_obj3_records)} total Object_3 records")
        
        # Filter for student-only accounts
        student_only_records = []
        for rec in all_obj3_records:
            if check_student_only_role(rec, config["role_field"]):
                student_only_records.append(rec)
                email = extract_email_value(rec, config["email_field"])
                if email:
                    results["emails"].add(email)
        
        results["found"]["object_3"] = student_only_records
        print(f"Found {len(student_only_records)} student-only accounts")
        
    except Exception as e:
        print(f"ERROR fetching Object_3 records: {e}")
        results["errors"]["object_3"] = str(e)
        return results
    
    if not student_only_records:
        print("\nNo student-only accounts found matching criteria")
        return results
    
    # Step 2: Find related records by email in Object_10, Object_29, Object_113
    print(f"\n{'='*60}")
    print(f"Step 2: Finding related records by email ({len(results['emails'])} emails)...")
    print(f"{'='*60}")
    
    for object_key in ["object_10", "object_29", "object_113"]:
        config = OBJECT_CONFIGS.get(object_key)
        if not config:
            continue
        
        print(f"\nSearching {object_key} ({config['name']})...")
        
        email_field = config["email_field"]
        related_records = []
        
        try:
            # Fetch all records (we'll filter by email locally)
            # Note: Knack doesn't support "in" operator for emails easily
            all_records = fetch_all_records(app_id, api_key, object_key)
            
            # Filter by matching emails
            for rec in all_records:
                rec_email = extract_email_value(rec, email_field)
                if rec_email in results["emails"]:
                    related_records.append(rec)
            
            results["found"][object_key] = related_records
            print(f"  Found {len(related_records)} related records")
            
        except Exception as e:
            print(f"  ERROR fetching records: {e}")
            results["errors"][object_key] = str(e)
    
    # Step 3: Delete records (if not dry run)
    if not dry_run:
        print(f"\n{'='*60}")
        print("Step 3: Deleting records...")
        print(f"{'='*60}")
        
        total_to_delete = sum(len(records) for records in results["found"].values())
        deleted_count = 0
        
        # Delete in order: Object_113, Object_29, Object_10, then Object_3
        delete_order = ["object_113", "object_29", "object_10", "object_3"]
        
        for object_key in delete_order:
            records = results["found"].get(object_key, [])
            if not records:
                continue
            
            config = OBJECT_CONFIGS[object_key]
            print(f"\nDeleting {len(records)} records from {object_key} ({config['name']})...")
            
            deleted = 0
            errors = 0
            
            for i, rec in enumerate(records, 1):
                if delete_record(app_id, api_key, object_key, rec["id"], session):
                    deleted += 1
                    deleted_count += 1
                    if verbose or i % 10 == 0:
                        print(f"  [{deleted_count}/{total_to_delete}] Deleted {rec['id']}")
                else:
                    errors += 1
                
                time.sleep(0.25)  # Rate limiting
            
            results["deleted"][object_key] = deleted
            if errors > 0:
                results["errors"][f"{object_key}_delete"] = f"{errors} deletion errors"
    
    # Write backup if requested
    if backup_path and results["found"]:
        try:
            write_backup_csv(backup_path, results["found"])
            print(f"\n✓ Backup written to {backup_path}")
        except Exception as e:
            print(f"\n⚠ Could not write backup: {e}")
    
    return results


def delete_questionnaire_data(app_id: str, api_key: str,
                             establishment_id: Optional[str] = None,
                             year_group: Optional[str] = None,
                             tutor_group: Optional[str] = None,
                             dry_run: bool = True,
                             backup_path: Optional[str] = None,
                             verbose: bool = False) -> Dict[str, Any]:
    """
    Mode 2: Delete questionnaire data only (Object_10 & Object_29)
    """
    results = {
        "mode": "questionnaire-data",
        "filters": {
            "establishment": establishment_id,
            "year_group": year_group,
            "tutor_group": tutor_group
        },
        "found": {},
        "deleted": {},
        "errors": {}
    }
    
    session = requests.Session()
    session.headers.update(headers(app_id, api_key))
    
    print("\n" + "="*60)
    print("Finding questionnaire records to delete...")
    print("="*60)
    
    # Process Object_10 and Object_29
    for object_key in ["object_10", "object_29"]:
        config = OBJECT_CONFIGS[object_key]
        print(f"\nSearching {object_key} ({config['name']})...")
        
        filters = []
        
        if establishment_id:
            filters.append({
                "field": config["establishment_field"],
                "operator": "is",
                "value": establishment_id
            })
        
        if year_group:
            filters.append({
                "field": config["year_group_field"],
                "operator": "is",
                "value": year_group
            })
        
        if tutor_group:
            filters.append({
                "field": config["tutor_group_field"],
                "operator": "is",
                "value": tutor_group
            })
        
        if verbose and filters:
            print(f"  Filters: {filters}")
        
        try:
            records = fetch_all_records(app_id, api_key, object_key, filters=filters)
            results["found"][object_key] = records
            print(f"  Found {len(records)} records")
            
        except Exception as e:
            print(f"  ERROR fetching records: {e}")
            results["errors"][object_key] = str(e)
    
    # Delete records (if not dry run)
    if not dry_run:
        print(f"\n{'='*60}")
        print("Deleting questionnaire records...")
        print(f"{'='*60}")
        
        total_to_delete = sum(len(records) for records in results["found"].values())
        deleted_count = 0
        
        for object_key, records in results["found"].items():
            if not records:
                continue
            
            config = OBJECT_CONFIGS[object_key]
            print(f"\nDeleting {len(records)} records from {object_key} ({config['name']})...")
            
            deleted = 0
            errors = 0
            
            for i, rec in enumerate(records, 1):
                if delete_record(app_id, api_key, object_key, rec["id"], session):
                    deleted += 1
                    deleted_count += 1
                    if verbose or i % 10 == 0:
                        print(f"  [{deleted_count}/{total_to_delete}] Deleted {rec['id']}")
                else:
                    errors += 1
                
                time.sleep(0.25)  # Rate limiting
            
            results["deleted"][object_key] = deleted
            if errors > 0:
                results["errors"][f"{object_key}_delete"] = f"{errors} deletion errors"
    
    # Write backup if requested
    if backup_path and results["found"]:
        try:
            write_backup_csv(backup_path, results["found"])
            print(f"\n✓ Backup written to {backup_path}")
        except Exception as e:
            print(f"\n⚠ Could not write backup: {e}")
    
    return results


def main():
    load_env_files()
    
    ap = argparse.ArgumentParser(
        description="Delete student records from Knack with various filtering options",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Deletion Modes:
--------------
1. all-student-data: Delete Object_3 accounts with ONLY "Student" role,
                    plus all related records in Object_10, Object_29, Object_113

2. questionnaire-data: Delete only Object_10 & Object_29 records

Examples:
--------
# Delete all student data for an establishment (by name)
python knack_delete_students.py --mode all-student-data --establishment "Springfield High" --apply

# Delete questionnaire data for Year 11, Group A
python knack_delete_students.py --mode questionnaire-data --establishment 12345 --year-group "Year 11" --tutor-group "A" --apply

# Dry run with backup
python knack_delete_students.py --mode all-student-data --establishment "Springfield High" --backup students.csv

# List available establishments
python knack_establishment_lookup.py --list
        """
    )
    
    ap.add_argument("--app-id", help="Knack Application ID (or set KNACK_APP_ID)")
    ap.add_argument("--api-key", help="Knack REST API Key (or set KNACK_API_KEY)")
    ap.add_argument("--mode", required=True, 
                    choices=["all-student-data", "questionnaire-data"],
                    help="Deletion mode: what type of data to delete")
    ap.add_argument("--establishment", 
                    help="Establishment ID or name (uses lookup if name provided)")
    ap.add_argument("--year-group", 
                    help="Filter by year group")
    ap.add_argument("--tutor-group", 
                    help="Filter by tutor group")
    ap.add_argument("--apply", action="store_true",
                    help="Actually delete records (without this, runs in dry-run mode)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Preview what would be deleted (default if --apply not used)")
    ap.add_argument("--backup", 
                    help="Path to CSV file for backing up records before deletion")
    ap.add_argument("--verbose", "-v", action="store_true",
                    help="Verbose output")
    
    args = ap.parse_args()
    
    # Get credentials
    app_id = args.app_id or os.getenv("KNACK_APP_ID")
    api_key = args.api_key or os.getenv("KNACK_API_KEY")
    
    if not app_id or not api_key:
        print("ERROR: Missing Knack credentials.")
        print("Provide --app-id/--api-key or set KNACK_APP_ID/KNACK_API_KEY")
        sys.exit(2)
    
    # Resolve establishment ID if name provided
    establishment_id = None
    if args.establishment:
        establishment_id = get_establishment_id(app_id, api_key, args.establishment)
        if not establishment_id:
            print(f"\nERROR: Could not resolve establishment '{args.establishment}'")
            print("Please check the name or use the establishment ID directly")
            sys.exit(1)
    
    # Determine if dry run
    dry_run = not args.apply
    
    print("\n" + "="*60)
    print("KNACK DELETE STUDENTS")
    print("="*60)
    print(f"Mode:          {args.mode}")
    print(f"Establishment: {establishment_id or 'All'}")
    print(f"Year Group:    {args.year_group or 'All'}")
    print(f"Tutor Group:   {args.tutor_group or 'All'}")
    print(f"Status:        {'DRY RUN' if dry_run else '⚠ WILL DELETE RECORDS'}")
    
    # Execute deletion based on mode
    if args.mode == "all-student-data":
        results = delete_all_student_data(
            app_id, api_key,
            establishment_id=establishment_id,
            year_group=args.year_group,
            tutor_group=args.tutor_group,
            dry_run=dry_run,
            backup_path=args.backup,
            verbose=args.verbose
        )
    else:  # questionnaire-data
        results = delete_questionnaire_data(
            app_id, api_key,
            establishment_id=establishment_id,
            year_group=args.year_group,
            tutor_group=args.tutor_group,
            dry_run=dry_run,
            backup_path=args.backup,
            verbose=args.verbose
        )
    
    # Print summary
    print("\n" + "="*60)
    print("DELETION SUMMARY")
    print("="*60)
    
    # Found records
    total_found = 0
    print("\nRecords Found:")
    for obj_key, records in results["found"].items():
        config = OBJECT_CONFIGS.get(obj_key, {})
        count = len(records)
        total_found += count
        print(f"  {obj_key} ({config.get('name', 'Unknown')}): {count}")
    
    if args.mode == "all-student-data" and results.get("emails"):
        print(f"\nUnique student emails: {len(results['emails'])}")
    
    # Deleted records (if applied)
    if not dry_run and results["deleted"]:
        print("\nRecords Deleted:")
        for obj_key, count in results["deleted"].items():
            config = OBJECT_CONFIGS.get(obj_key, {})
            print(f"  {obj_key} ({config.get('name', 'Unknown')}): {count}")
    
    # Errors
    if results["errors"]:
        print("\n⚠ Errors encountered:")
        for key, error in results["errors"].items():
            print(f"  {key}: {error}")
    
    # Final message
    if dry_run:
        print("\n" + "="*60)
        print("DRY RUN COMPLETE - No records were deleted")
        print("="*60)
        if total_found > 0:
            print(f"\n⚠ WARNING: {total_found} records would be deleted!")
            print("To actually delete these records, re-run with --apply")
            print("\nBe VERY careful - deletion is permanent!")
    else:
        print("\n" + "="*60)
        print("DELETION COMPLETE")
        print("="*60)
        total_deleted = sum(results["deleted"].values())
        print(f"✓ Successfully deleted {total_deleted} records")
    
    if args.backup and os.path.exists(args.backup):
        print(f"\nBackup saved to: {args.backup}")


if __name__ == "__main__":
    main()
