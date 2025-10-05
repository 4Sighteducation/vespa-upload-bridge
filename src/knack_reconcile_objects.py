#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Knack Object Reconciliation - Compare and sync Object_10 (VESPA Results) and Object_29 (Questionnaires)

These two objects should have matching records for each student. This script:
1. Compares records between Object_10 and Object_29 using email and name
2. Reports differences (missing records, orphans, duplicates)
3. Offers to fix discrepancies by creating missing records or deleting orphans

Features:
- Match records by email (primary) or name (fallback)
- Detailed difference report
- Interactive or automatic fixing
- Dry-run mode for safety
- CSV export of discrepancies
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

# Try to import dotenv and establishment lookup
try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

try:
    from knack_establishment_lookup import get_establishment_id, get_establishment_name, load_env_files as load_env_from_lookup
except ImportError:
    get_establishment_id = None
    get_establishment_name = None
    load_env_from_lookup = None

API_BASE = "https://api.knack.com/v1"

# Object configurations
OBJECT_10_CONFIG = {
    "key": "object_10",
    "name": "VESPA Results",
    "email_field": "field_197",
    "name_field": "field_187",
    "establishment_field": "field_133",
    "year_group_field": "field_144",
    "tutor_group_field": "field_223",
    "connection_to_29": None  # Object_10 doesn't connect to 29
}

OBJECT_29_CONFIG = {
    "key": "object_29",
    "name": "Questionnaire Responses",
    "email_field": "field_2732",
    "name_field": "field_1823",
    "establishment_field": "field_1821",
    "year_group_field": "field_1826",
    "tutor_group_field": "field_1824",
    "connection_to_10": "field_792"  # Connection to Object_10
}


def load_env_files() -> None:
    """Load .env files from various locations"""
    if not load_dotenv:
        return
    
    try:
        load_dotenv()
    except Exception:
        pass
    
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        dot_script = os.path.join(script_dir, ".env")
        if os.path.isfile(dot_script):
            load_dotenv(dot_script, override=False)
    except Exception:
        pass
    
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        proj_root = os.path.abspath(os.path.join(script_dir, ".."))
        dot_root = os.path.join(proj_root, ".env")
        if os.path.isfile(dot_root):
            load_dotenv(dot_root, override=False)
    except Exception:
        pass


def headers(app_id: str, api_key: str) -> Dict[str, str]:
    """Generate API headers"""
    return {
        "X-Knack-Application-Id": app_id,
        "X-Knack-REST-API-Key": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def extract_email_value(record: Dict[str, Any], email_field_key: str) -> str:
    """Extract email from various Knack field formats"""
    raw = record.get(email_field_key)
    
    if isinstance(raw, str):
        if '<a href="mailto:' in raw:
            match = re.search(r'mailto:([^"]+)"', raw)
            if match:
                return match.group(1).strip().lower()
            match = re.search(r'>([^<]+@[^<]+)<', raw)
            if match:
                return match.group(1).strip().lower()
        return raw.strip().lower()
    
    if isinstance(raw, dict):
        email = raw.get("email") or raw.get("value") or ""
        return email.strip().lower()
    
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


def extract_name_value(record: Dict[str, Any], name_field_key: str) -> str:
    """Extract name from various Knack field formats"""
    raw = record.get(name_field_key)
    
    if isinstance(raw, str):
        return raw.strip()
    
    if isinstance(raw, dict):
        # Handle name object format {first: "John", last: "Doe"}
        if 'first' in raw and 'last' in raw:
            first = raw.get('first', '').strip()
            last = raw.get('last', '').strip()
            return f"{first} {last}".strip()
        # Handle value format
        return raw.get("value", "").strip()
    
    return ""


def extract_connection_id(record: Dict[str, Any], connection_field_key: str) -> Optional[str]:
    """Extract connected record ID from a connection field"""
    raw = record.get(connection_field_key)
    
    if isinstance(raw, str):
        # Check if it's HTML format with span class containing the ID
        if '<span class="' in raw:
            match = re.search(r'<span class="([a-f0-9]{24})"', raw)
            if match:
                return match.group(1)
        # Otherwise return as-is (might be a plain ID)
        return raw if raw else ""
    
    if isinstance(raw, dict):
        return raw.get("id", "")
    
    if isinstance(raw, list) and raw:
        first = raw[0]
        if isinstance(first, str):
            # Check HTML format here too
            if '<span class="' in first:
                match = re.search(r'<span class="([a-f0-9]{24})"', first)
                if match:
                    return match.group(1)
            return first
        if isinstance(first, dict):
            return first.get("id", "")
    
    return ""


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


def normalize_identifier(email: str, name: str) -> str:
    """Create a normalized identifier for matching (prefer email, fallback to name)"""
    if email:
        return f"email:{email.lower().strip()}"
    elif name:
        return f"name:{name.lower().strip()}"
    else:
        return ""


def compare_objects(records_10: List[Dict[str, Any]], 
                   records_29: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Compare records from Object_10 and Object_29, return differences"""
    
    # Index Object_10 records by identifier AND by ID
    obj10_index: Dict[str, Dict[str, Any]] = {}
    obj10_by_id: Dict[str, Dict[str, Any]] = {}
    
    for rec in records_10:
        email = extract_email_value(rec, OBJECT_10_CONFIG["email_field"])
        name = extract_name_value(rec, OBJECT_10_CONFIG["name_field"])
        identifier = normalize_identifier(email, name)
        
        obj10_by_id[rec.get("id")] = rec
        
        if identifier:
            if identifier in obj10_index:
                # Duplicate in Object_10!
                if "duplicates_10" not in obj10_index:
                    obj10_index["__duplicates_10__"] = []
                obj10_index["__duplicates_10__"].append(rec)
            else:
                obj10_index[identifier] = rec
    
    # Index Object_29 records by identifier, connection, AND by ID
    obj29_index: Dict[str, Dict[str, Any]] = {}
    obj29_by_id: Dict[str, Dict[str, Any]] = {}
    obj29_by_connection: Dict[str, Dict[str, Any]] = {}
    
    for rec in records_29:
        email = extract_email_value(rec, OBJECT_29_CONFIG["email_field"])
        name = extract_name_value(rec, OBJECT_29_CONFIG["name_field"])
        identifier = normalize_identifier(email, name)
        connection_id = extract_connection_id(rec, OBJECT_29_CONFIG["connection_to_10"])
        
        obj29_by_id[rec.get("id")] = rec
        
        # Track connection if present
        if connection_id:
            obj29_by_connection[connection_id] = rec
        
        if identifier:
            if identifier in obj29_index:
                # Duplicate in Object_29!
                if "__duplicates_29__" not in obj29_index:
                    obj29_index["__duplicates_29__"] = []
                obj29_index["__duplicates_29__"].append(rec)
            else:
                obj29_index[identifier] = rec
    
    # Find differences
    identifiers_10 = set(k for k in obj10_index.keys() if not k.startswith("__"))
    identifiers_29 = set(k for k in obj29_index.keys() if not k.startswith("__"))
    
    only_in_10 = identifiers_10 - identifiers_29  # In Object_10 but missing from Object_29
    only_in_29 = identifiers_29 - identifiers_10  # In Object_29 but missing from Object_10
    in_both = identifiers_10 & identifiers_29     # Present in both
    
    results = {
        "total_10": len(records_10),
        "total_29": len(records_29),
        "unique_10": len(identifiers_10),
        "unique_29": len(identifiers_29),
        "matched": len(in_both),
        "only_in_10": [],
        "only_in_29": [],
        "connected_but_missing_email": [],  # New category!
        "truly_orphaned_29": [],  # Object_29 records with no connection
        "duplicates_10": obj10_index.get("__duplicates_10__", []),
        "duplicates_29": obj29_index.get("__duplicates_29__", []),
    }
    
    # Check Object_29 records without email - see if they're connected
    for rec29 in records_29:
        email = extract_email_value(rec29, OBJECT_29_CONFIG["email_field"])
        name = extract_name_value(rec29, OBJECT_29_CONFIG["name_field"])
        connection_id = extract_connection_id(rec29, OBJECT_29_CONFIG["connection_to_10"])
        
        # If no email, check if connected to Object_10
        if not email and connection_id:
            # Check if the connected Object_10 record exists
            connected_rec10 = obj10_by_id.get(connection_id)
            if connected_rec10:
                # This is connected! Not an orphan - just needs email populated
                obj10_email = extract_email_value(connected_rec10, OBJECT_10_CONFIG["email_field"])
                results["connected_but_missing_email"].append({
                    "obj29_id": rec29.get("id"),
                    "obj10_id": connection_id,
                    "name": name,
                    "missing_email": obj10_email,
                    "record_29": rec29,
                    "record_10": connected_rec10
                })
    
    # Build detailed lists
    for identifier in only_in_10:
        rec = obj10_index[identifier]
        email = extract_email_value(rec, OBJECT_10_CONFIG["email_field"])
        name = extract_name_value(rec, OBJECT_10_CONFIG["name_field"])
        
        # Check if there's actually a connected Object_29 record
        rec_id = rec.get("id")
        connected_29 = obj29_by_connection.get(rec_id)
        
        if connected_29:
            # Not really missing! It's connected but the Object_29 record has no email
            # (Already handled in connected_but_missing_email)
            continue
        
        results["only_in_10"].append({
            "id": rec.get("id"),
            "email": email,
            "name": name,
            "identifier": identifier,
            "record": rec
        })
    
    # Check Object_29 records that appear orphaned
    for identifier in only_in_29:
        rec = obj29_index[identifier]
        email = extract_email_value(rec, OBJECT_29_CONFIG["email_field"])
        name = extract_name_value(rec, OBJECT_29_CONFIG["name_field"])
        connection_id = extract_connection_id(rec, OBJECT_29_CONFIG["connection_to_10"])
        
        # Check if it has a valid connection
        if connection_id and connection_id in obj10_by_id:
            # It's connected, so not truly orphaned
            # Might be in connected_but_missing_email if email is blank
            continue
        
        # Truly orphaned - has identifier but no valid connection
        results["truly_orphaned_29"].append({
            "id": rec.get("id"),
            "email": email,
            "name": name,
            "identifier": identifier,
            "connection_id": connection_id or "none",
            "record": rec
        })
    
    return results


def write_discrepancy_report(path: str, comparison: Dict[str, Any]) -> None:
    """Write a CSV report of discrepancies"""
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["type", "object", "record_id", "email", "name", "identifier"])
        
        for item in comparison["only_in_10"]:
            w.writerow([
                "missing_from_29",
                "object_10",
                item["id"],
                item["email"],
                item["name"],
                item["identifier"]
            ])
        
        for item in comparison["only_in_29"]:
            w.writerow([
                "orphan_in_29",
                "object_29",
                item["id"],
                item["email"],
                item["name"],
                item["identifier"]
            ])
        
        for rec in comparison["duplicates_10"]:
            email = extract_email_value(rec, OBJECT_10_CONFIG["email_field"])
            name = extract_name_value(rec, OBJECT_10_CONFIG["name_field"])
            w.writerow([
                "duplicate",
                "object_10",
                rec.get("id"),
                email,
                name,
                normalize_identifier(email, name)
            ])
        
        for rec in comparison["duplicates_29"]:
            email = extract_email_value(rec, OBJECT_29_CONFIG["email_field"])
            name = extract_name_value(rec, OBJECT_29_CONFIG["name_field"])
            w.writerow([
                "duplicate",
                "object_29",
                rec.get("id"),
                email,
                name,
                normalize_identifier(email, name)
            ])


def create_object29_record(app_id: str, api_key: str, 
                          obj10_record: Dict[str, Any],
                          session: Optional[requests.Session] = None) -> Optional[str]:
    """Create a matching Object_29 record from an Object_10 record"""
    if not session:
        session = requests.Session()
        session.headers.update(headers(app_id, api_key))
    
    # Build payload for Object_29 from Object_10 data
    payload = {}
    
    # Map essential fields from Object_10 to Object_29
    # Email
    email = extract_email_value(obj10_record, OBJECT_10_CONFIG["email_field"])
    if email:
        payload[OBJECT_29_CONFIG["email_field"]] = email
    
    # Name
    name = extract_name_value(obj10_record, OBJECT_10_CONFIG["name_field"])
    if name:
        payload[OBJECT_29_CONFIG["name_field"]] = name
    
    # Establishment (connection field)
    establishment = obj10_record.get(OBJECT_10_CONFIG["establishment_field"])
    if establishment:
        payload[OBJECT_29_CONFIG["establishment_field"]] = establishment
    
    # Year group
    year_group = obj10_record.get(OBJECT_10_CONFIG["year_group_field"])
    if year_group:
        payload[OBJECT_29_CONFIG["year_group_field"]] = year_group
    
    # Tutor group
    tutor_group = obj10_record.get(OBJECT_10_CONFIG["tutor_group_field"])
    if tutor_group:
        payload[OBJECT_29_CONFIG["tutor_group_field"]] = tutor_group
    
    # Connection to Object_10
    payload[OBJECT_29_CONFIG["connection_to_10"]] = obj10_record.get("id")
    
    # Create the record
    url = f"{API_BASE}/objects/{OBJECT_29_CONFIG['key']}/records"
    
    try:
        r = session.post(url, json=payload, timeout=60)
        if r.status_code in (200, 201):
            data = r.json()
            return data.get("id")
        else:
            print(f"    ERROR: {r.status_code} - {r.text}")
            return None
    except Exception as e:
        print(f"    EXCEPTION: {e}")
        return None


def populate_object29_email(app_id: str, api_key: str,
                           obj29_record_id: str,
                           email_to_populate: str,
                           session: Optional[requests.Session] = None) -> bool:
    """Populate the email field in an Object_29 record"""
    if not session:
        session = requests.Session()
        session.headers.update(headers(app_id, api_key))
    
    payload = {
        OBJECT_29_CONFIG["email_field"]: email_to_populate
    }
    
    url = f"{API_BASE}/objects/{OBJECT_29_CONFIG['key']}/records/{obj29_record_id}"
    
    try:
        r = session.put(url, json=payload, timeout=60)
        return r.status_code in (200, 204)
    except requests.RequestException:
        return False


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


def main():
    load_env_files()
    
    ap = argparse.ArgumentParser(
        description="Compare and reconcile Object_10 (VESPA Results) and Object_29 (Questionnaires)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
These two objects should have matching student records. This script identifies discrepancies:
  - Records in Object_10 but missing from Object_29
  - Records in Object_29 but not in Object_10 (orphans)
  - Duplicate records within each object

Fixing options:
  - Create missing Object_29 records from Object_10 data
  - Delete orphaned Object_29 records (with confirmation)
  - Report duplicates (manual resolution needed)

Examples:
  # Check discrepancies for an establishment
  python knack_reconcile_objects.py --establishment 61116a30966757001e1e7ead
  
  # Check and save report
  python knack_reconcile_objects.py --establishment "St Bede" --report discrepancies.csv
  
  # Fix by creating missing Object_29 records
  python knack_reconcile_objects.py --establishment 61116a30966757001e1e7ead --fix-create-29 --apply
  
  # Fix by deleting orphaned Object_29 records
  python knack_reconcile_objects.py --establishment 61116a30966757001e1e7ead --fix-delete-orphans --apply
        """
    )
    
    ap.add_argument("--app-id", help="Knack Application ID (or set KNACK_APP_ID)")
    ap.add_argument("--api-key", help="Knack REST API Key (or set KNACK_API_KEY)")
    ap.add_argument("--establishment", required=True,
                    help="Establishment ID or name")
    ap.add_argument("--report", 
                    help="Save discrepancy report to CSV file")
    ap.add_argument("--fix-create-29", action="store_true",
                    help="Create missing Object_29 records from Object_10 data")
    ap.add_argument("--fix-populate-emails", action="store_true",
                    help="Populate missing emails in Object_29 from connected Object_10 records")
    ap.add_argument("--fix-delete-orphans", action="store_true",
                    help="Delete truly orphaned Object_29 records (not connected to Object_10)")
    ap.add_argument("--apply", action="store_true",
                    help="Actually apply fixes (without this, runs in dry-run mode)")
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
    
    # Resolve establishment ID
    establishment_id = args.establishment
    establishment_name = ""
    
    if get_establishment_id and not re.match(r'^[a-f0-9]{24}$', establishment_id.lower()):
        print(f"Searching for establishment: {establishment_id}")
        resolved_id = get_establishment_id(app_id, api_key, establishment_id)
        if not resolved_id:
            print(f"\nERROR: Could not find establishment '{establishment_id}'")
            sys.exit(1)
        establishment_id = resolved_id
    
    # Get establishment name
    if get_establishment_name:
        establishment_name = get_establishment_name(app_id, api_key, establishment_id)
    
    print("="*80)
    print("KNACK OBJECT RECONCILIATION")
    print("="*80)
    print(f"Establishment: {establishment_name or establishment_id}")
    print(f"Comparing:     Object_10 (VESPA Results) ↔ Object_29 (Questionnaires)")
    print()
    
    # Fetch records from both objects
    print("Fetching Object_10 records...")
    filters_10 = [{
        "field": OBJECT_10_CONFIG["establishment_field"],
        "operator": "is",
        "value": establishment_id
    }]
    
    try:
        records_10 = fetch_all_records(app_id, api_key, OBJECT_10_CONFIG["key"], filters=filters_10)
        print(f"✓ Found {len(records_10)} Object_10 records")
    except Exception as e:
        print(f"ERROR fetching Object_10: {e}")
        sys.exit(1)
    
    print("\nFetching Object_29 records...")
    filters_29 = [{
        "field": OBJECT_29_CONFIG["establishment_field"],
        "operator": "is",
        "value": establishment_id
    }]
    
    try:
        records_29 = fetch_all_records(app_id, api_key, OBJECT_29_CONFIG["key"], filters=filters_29)
        print(f"✓ Found {len(records_29)} Object_29 records")
    except Exception as e:
        print(f"ERROR fetching Object_29: {e}")
        sys.exit(1)
    
    # Compare records
    print("\nComparing records...")
    comparison = compare_objects(records_10, records_29)
    
    # Print summary
    print("\n" + "="*80)
    print("COMPARISON SUMMARY")
    print("="*80)
    print(f"Total records in Object_10:                {comparison['total_10']}")
    print(f"Total records in Object_29:                {comparison['total_29']}")
    print(f"Unique identifiers in Object_10:           {comparison['unique_10']}")
    print(f"Unique identifiers in Object_29:           {comparison['unique_29']}")
    print(f"Matched (in both with emails):             {comparison['matched']}")
    print()
    print(f"✓ Connected but missing email in Obj29:    {len(comparison['connected_but_missing_email'])} (fixable)")
    print(f"⚠ Truly missing from Object_29:            {len(comparison['only_in_10'])} (needs creation)")
    print(f"⚠ Truly orphaned in Object_29:             {len(comparison['truly_orphaned_29'])} (no connection)")
    print(f"⚠ Duplicates in Object_10:                 {len(comparison['duplicates_10'])}")
    print(f"⚠ Duplicates in Object_29:                 {len(comparison['duplicates_29'])}")
    
    # Show details
    if comparison['connected_but_missing_email']:
        print("\n" + "-"*80)
        print(f"✓ CONNECTED BUT MISSING EMAIL ({len(comparison['connected_but_missing_email'])} records)")
        print("-"*80)
        print("These Object_29 records are properly connected to Object_10 via field_792")
        print("but are missing their email in field_2732. Easily fixable!")
        for i, item in enumerate(comparison['connected_but_missing_email'][:10], 1):
            print(f"  {i}. {item['name']} - should be: {item['missing_email']}")
            if args.verbose:
                print(f"     Object_29 ID: {item['obj29_id']}")
                print(f"     Connected to Object_10 ID: {item['obj10_id']}")
        if len(comparison['connected_but_missing_email']) > 10:
            print(f"  ... and {len(comparison['connected_but_missing_email']) - 10} more")
    
    if comparison['only_in_10']:
        print("\n" + "-"*80)
        print(f"⚠ TRULY MISSING FROM OBJECT_29 ({len(comparison['only_in_10'])} records)")
        print("-"*80)
        print("These students exist in Object_10 but have NO Object_29 record:")
        for i, item in enumerate(comparison['only_in_10'][:10], 1):
            print(f"  {i}. {item['name']} ({item['email'] or 'no email'})")
            if args.verbose:
                print(f"     Object_10 ID: {item['id']}")
        if len(comparison['only_in_10']) > 10:
            print(f"  ... and {len(comparison['only_in_10']) - 10} more")
    
    if comparison['truly_orphaned_29']:
        print("\n" + "-"*80)
        print(f"⚠ TRULY ORPHANED IN OBJECT_29 ({len(comparison['truly_orphaned_29'])} records)")
        print("-"*80)
        print("These Object_29 records have no valid connection to Object_10:")
        for i, item in enumerate(comparison['truly_orphaned_29'][:10], 1):
            print(f"  {i}. {item['name']} ({item['email'] or 'no email'})")
            if args.verbose:
                print(f"     Object_29 ID: {item['id']}")
                print(f"     Connection ID: {item['connection_id']}")
        if len(comparison['truly_orphaned_29']) > 10:
            print(f"  ... and {len(comparison['truly_orphaned_29']) - 10} more")
    
    if comparison['duplicates_10'] or comparison['duplicates_29']:
        print("\n" + "-"*80)
        print("DUPLICATES DETECTED")
        print("-"*80)
        if comparison['duplicates_10']:
            print(f"  Object_10 has {len(comparison['duplicates_10'])} duplicate records")
        if comparison['duplicates_29']:
            print(f"  Object_29 has {len(comparison['duplicates_29'])} duplicate records")
        print("  Note: Run deduplication scripts to fix duplicates first")
    
    # Write report if requested
    if args.report:
        write_discrepancy_report(args.report, comparison)
        print(f"\n✓ Discrepancy report saved to: {args.report}")
    
    # Apply fixes if requested
    if args.fix_populate_emails and comparison['connected_but_missing_email']:
        print("\n" + "="*80)
        print("FIX: POPULATE MISSING EMAILS IN OBJECT_29")
        print("="*80)
        
        if not args.apply:
            print("\nDRY RUN - Would populate emails for:")
            for i, item in enumerate(comparison['connected_but_missing_email'][:5], 1):
                print(f"  {i}. {item['name']} ← {item['missing_email']}")
            if len(comparison['connected_but_missing_email']) > 5:
                print(f"  ... and {len(comparison['connected_but_missing_email']) - 5} more")
            print("\nTo apply, re-run with --apply")
        else:
            confirm = input(f"\n✓ About to populate {len(comparison['connected_but_missing_email'])} email fields. Type 'POPULATE' to confirm: ").strip()
            if confirm != "POPULATE":
                print("Aborted.")
            else:
                session = requests.Session()
                session.headers.update(headers(app_id, api_key))
                
                populated = 0
                errors = 0
                
                for i, item in enumerate(comparison['connected_but_missing_email'], 1):
                    print(f"[{i}/{len(comparison['connected_but_missing_email'])}] Populating email for {item['name']}...")
                    if populate_object29_email(app_id, api_key, item['obj29_id'], item['missing_email'], session):
                        populated += 1
                        print(f"  ✓ Set email to: {item['missing_email']}")
                    else:
                        errors += 1
                        print(f"  ✗ Failed")
                    
                    time.sleep(0.2)  # Rate limiting
                
                print(f"\n✓ Populated {populated} email fields")
                if errors > 0:
                    print(f"⚠ {errors} errors occurred")
    
    if args.fix_create_29 and comparison['only_in_10']:
        print("\n" + "="*80)
        print("FIX: CREATE MISSING OBJECT_29 RECORDS")
        print("="*80)
        
        if not args.apply:
            print("\nDRY RUN - Would create the following Object_29 records:")
            for i, item in enumerate(comparison['only_in_10'][:5], 1):
                print(f"  {i}. {item['name']} ({item['email']})")
            if len(comparison['only_in_10']) > 5:
                print(f"  ... and {len(comparison['only_in_10']) - 5} more")
            print("\nTo apply, re-run with --apply")
        else:
            confirm = input(f"\n⚠ About to create {len(comparison['only_in_10'])} Object_29 records. Type 'CREATE' to confirm: ").strip()
            if confirm != "CREATE":
                print("Aborted.")
                return
            
            session = requests.Session()
            session.headers.update(headers(app_id, api_key))
            
            created = 0
            errors = 0
            
            for i, item in enumerate(comparison['only_in_10'], 1):
                print(f"[{i}/{len(comparison['only_in_10'])}] Creating record for {item['name']}...")
                new_id = create_object29_record(app_id, api_key, item['record'], session)
                if new_id:
                    created += 1
                    print(f"  ✓ Created with ID: {new_id}")
                else:
                    errors += 1
                
                time.sleep(0.3)  # Rate limiting
            
            print(f"\n✓ Created {created} records")
            if errors > 0:
                print(f"⚠ {errors} errors occurred")
    
    if args.fix_delete_orphans and comparison['truly_orphaned_29']:
        print("\n" + "="*80)
        print("FIX: DELETE TRULY ORPHANED OBJECT_29 RECORDS")
        print("="*80)
        print("⚠ These records have no valid connection to Object_10")
        
        if not args.apply:
            print("\nDRY RUN - Would delete the following Object_29 records:")
            for i, item in enumerate(comparison['truly_orphaned_29'][:5], 1):
                print(f"  {i}. {item['name']} ({item['email'] or 'no email'})")
            if len(comparison['truly_orphaned_29']) > 5:
                print(f"  ... and {len(comparison['truly_orphaned_29']) - 5} more")
            print("\nTo apply, re-run with --apply")
        else:
            print("\n⚠ WARNING: This will permanently delete records!")
            confirm = input(f"Type 'DELETE' to delete {len(comparison['truly_orphaned_29'])} orphaned Object_29 records: ").strip()
            if confirm != "DELETE":
                print("Aborted.")
            else:
                session = requests.Session()
                session.headers.update(headers(app_id, api_key))
                
                deleted = 0
                errors = 0
                
                for i, item in enumerate(comparison['truly_orphaned_29'], 1):
                    print(f"[{i}/{len(comparison['truly_orphaned_29'])}] Deleting {item['name']}...")
                    if delete_record(app_id, api_key, OBJECT_29_CONFIG['key'], item['id'], session):
                        deleted += 1
                        print(f"  ✓ Deleted")
                    else:
                        errors += 1
                        print(f"  ✗ Failed")
                    
                    time.sleep(0.3)  # Rate limiting
                
                print(f"\n✓ Deleted {deleted} records")
                if errors > 0:
                    print(f"⚠ {errors} errors occurred")
    
    print("\n" + "="*80)
    print("RECONCILIATION COMPLETE")
    print("="*80)


if __name__ == "__main__":
    main()
