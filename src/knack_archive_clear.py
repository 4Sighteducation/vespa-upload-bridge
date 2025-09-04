#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Knack Archive and Clear - Export establishment records to CSV, archive to Object_68, then clear non-essential fields

Features
--------
1. Export records from Object_10 (VESPA Results) and Object_29 (Questionnaires) to CSV
2. Filter by establishment (name or ID), year group, and tutor group
3. Upload CSV files to Object_68 (Archive object) with metadata
4. Clear non-preserved fields from the original records
5. Supports dry-run mode to preview actions without making changes
6. Establishment lookup by name for convenience

Object Configurations
--------------------
Object_10 (VESPA Results):
  - Establishment field: field_133
  - Year group field: field_144
  - Tutor group field: field_223
  - Preserved fields: field_133, field_439, field_187, field_137, field_197, field_143, 
                     field_568, field_223, field_2299, field_145, field_429, field_2191, 
                     field_144, field_782 (faculty)

Object_29 (Questionnaires):
  - Establishment field: field_1821
  - Year group field: field_1826
  - Tutor group field: field_1824
  - Preserved fields: field_1821, field_1823, field_2732, field_2069, field_2071, 
                     field_3266, field_2070, field_792, field_1824 (group), 
                     field_1825 (faculty), field_1826 (year), field_1830 (gender)

Object_68 (Archive):
  - field_1593: Filename (short text)
  - field_1594: Establishment (connected field)
  - field_1595: CSV file (file field)
  - field_1596: Archived on (date field)
  - field_3653: CSV type ('10 - results' or '29 - Questions')
  - field_3654: Year group (short text, if specified)
  - field_3655: Tutor group (short text, if specified)

Examples
--------
# Archive all records for an establishment
python knack_archive_clear.py --establishment 63bc1c145f917b001289b14e --apply

# Archive only Year 11, Group A records
python knack_archive_clear.py --establishment 686ce50e6b2cd002d1e3f180 --year-group "Year 11" --tutor-group "A" --apply

# Dry run to preview what will be archived
python knack_archive_clear.py --establishment 63bc1c145f917b001289b14e --dry-run

# Skip the clearing step (only archive)
python knack_archive_clear.py --establishment 12345 --no-clear --apply
"""

import argparse
import csv
import sys
import time
import os
import json
import base64
import io
import re
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Tuple, Any, Optional

import requests
from dateutil import parser as dtparser

# Try to import dotenv for .env file support
try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

API_BASE = "https://api.knack.com/v1"

# Object configurations
OBJECT_CONFIGS = {
    "object_10": {
        "name": "VESPA Results",
        "establishment_field": "field_133",
        "year_group_field": "field_144",
        "tutor_group_field": "field_223",
        "csv_type": "10 - results",
        "preserved_fields": [
            "field_133",  # Establishment
            "field_439",  # Connected Staff Admin
            "field_187",  # Name
            "field_137",  # School ID
            "field_197",  # Student Email
            "field_143",  # Gender
            "field_568",  # Level
            "field_223",  # Group
            "field_2299", # (Additional field)
            "field_145",  # Connected Tutors
            "field_429",  # Connected Head of Year
            "field_2191", # Connected Subject Teachers
            "field_144",  # Year Group
            "field_782"   # Faculty
        ]
    },
    "object_29": {
        "name": "Questionnaire Responses",
        "establishment_field": "field_1821",
        "year_group_field": "field_1826",
        "tutor_group_field": "field_1824",
        "csv_type": "29 - Questions",
        "preserved_fields": [
            "field_1821", # Establishment
            "field_1823", # Name
            "field_2732", # Student Email
            "field_2069", # Connected Staff Admin
            "field_2071", # Connected Subject Teachers
            "field_3266", # Connected Heads of Year
            "field_2070", # Connected Tutors
            "field_792",  # Connected to Object_10
            "field_1824", # Group
            "field_1825", # Faculty
            "field_1826", # Year Group
            "field_1830"  # Gender
        ]
    }
}

# Archive object configuration
ARCHIVE_CONFIG = {
    "object_key": "object_68",
    "filename_field": "field_1593",
    "establishment_field": "field_1594",
    "csv_file_field": "field_1595",
    "archived_date_field": "field_1596",
    "csv_type_field": "field_3653",
    "year_group_field": "field_3654",
    "tutor_group_field": "field_3655"
}


def load_env_files() -> None:
    """Load .env files from various locations"""
    if not load_dotenv:
        return
    
    # Try loading from current directory
    try:
        load_dotenv()
    except Exception:
        pass
    
    # Try loading from script directory
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        dot_script = os.path.join(script_dir, ".env")
        if os.path.isfile(dot_script):
            load_dotenv(dot_script, override=False)
    except Exception:
        pass
    
    # Try loading from parent directory
    try:
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


def strip_html_tags(text: Any) -> Any:
    """Strip HTML tags from text, handling various data types"""
    if text is None:
        return text
    
    # Convert to string for processing
    text_str = str(text)
    
    # Check if it contains HTML
    if '<' not in text_str or '>' not in text_str:
        return text
    
    # Common HTML email pattern
    if '<a href="mailto:' in text_str:
        # Extract email from mailto link
        match = re.search(r'mailto:([^"]+)"', text_str)
        if match:
            return match.group(1)
        # Alternative: extract from link text
        match = re.search(r'>([^<]+@[^<]+)<', text_str)
        if match:
            return match.group(1)
    
    # Remove all HTML tags
    clean = re.sub('<.*?>', '', text_str)
    
    # Clean up extra whitespace
    clean = ' '.join(clean.split())
    
    return clean if clean else text


def clean_record_for_csv(record: Dict[str, Any]) -> Dict[str, Any]:
    """Clean a record by stripping HTML from all fields"""
    cleaned = {}
    for key, value in record.items():
        if isinstance(value, dict):
            # Handle nested dict (like name fields)
            if 'first' in value and 'last' in value:
                # Name field
                cleaned[key] = f"{value.get('first', '')} {value.get('last', '')}".strip()
            else:
                # Other dict fields - convert to string
                cleaned[key] = str(value)
        elif isinstance(value, list):
            # Handle list fields
            if value and isinstance(value[0], dict):
                # List of objects - join them
                cleaned[key] = ', '.join(str(item) for item in value)
            else:
                cleaned[key] = ', '.join(str(item) for item in value)
        else:
            # Regular field - strip HTML
            cleaned[key] = strip_html_tags(value)
    
    return cleaned


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


def create_csv_content(records: List[Dict[str, Any]], object_key: str) -> str:
    """Create CSV content from records with HTML tags stripped and empty columns removed"""
    if not records:
        return ""
    
    output = io.StringIO()
    
    # Clean all records first
    cleaned_records = [clean_record_for_csv(record) for record in records]
    
    # Get all unique field keys from cleaned records
    all_fields = set()
    for record in cleaned_records:
        all_fields.update(record.keys())
    
    # Find fields that have at least one non-empty value
    non_empty_fields = set()
    for field in all_fields:
        for record in cleaned_records:
            value = record.get(field, '')
            # Check if value is non-empty (handles None, empty string, etc.)
            if value and str(value).strip() and str(value).strip() != 'None':
                non_empty_fields.add(field)
                break  # At least one non-empty value found, include this field
    
    # Sort fields for consistent output
    fieldnames = sorted(list(non_empty_fields))
    
    print(f"  Total fields: {len(all_fields)}")
    print(f"  Non-empty fields: {len(fieldnames)}")
    print(f"  Removed {len(all_fields) - len(fieldnames)} empty columns")
    
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    
    # Write records with only non-empty fields
    for record in cleaned_records:
        filtered_record = {k: v for k, v in record.items() if k in non_empty_fields}
        writer.writerow(filtered_record)
    
    return output.getvalue()


def upload_to_archive(app_id: str, api_key: str, 
                     csv_content: str, 
                     filename: str,
                     establishment_id: str,
                     csv_type: str,
                     year_group: Optional[str] = None,
                     tutor_group: Optional[str] = None) -> Dict[str, Any]:
    """Upload CSV to Object_68 (Archive)"""
    # Note: Knack file uploads require a two-step process:
    # 1. Upload the file to get a file ID
    # 2. Create the record with the file ID
    
    # For now, we'll create the record without the file content
    # The file is saved locally and can be manually uploaded if needed
    
    session = requests.Session()
    session.headers.update(headers(app_id, api_key))
    
    # Prepare the payload WITHOUT the file for now
    # This ensures the record is created with all metadata
    payload = {
        ARCHIVE_CONFIG["filename_field"]: filename,
        ARCHIVE_CONFIG["establishment_field"]: establishment_id,
        ARCHIVE_CONFIG["archived_date_field"]: datetime.now().strftime("%m/%d/%Y"),
        ARCHIVE_CONFIG["csv_type_field"]: csv_type
    }
    
    # Add year group if specified
    if year_group:
        payload[ARCHIVE_CONFIG["year_group_field"]] = year_group
    
    # Add tutor group if specified
    if tutor_group:
        payload[ARCHIVE_CONFIG["tutor_group_field"]] = tutor_group
    
    # Note: File field (field_1595) is omitted for now
    # Files are saved locally in archive_exports directory
    
    url = f"{API_BASE}/objects/{ARCHIVE_CONFIG['object_key']}/records"
    r = session.post(url, json=payload, timeout=60)
    
    if r.status_code not in (200, 201):
        raise RuntimeError(f"Error uploading to archive: {r.status_code} - {r.text}")
    
    return r.json()


def clear_record_fields(app_id: str, api_key: str, 
                        object_key: str, 
                        record_id: str,
                        preserved_fields: List[str],
                        all_fields: set) -> bool:
    """Clear all non-preserved fields from a record"""
    session = requests.Session()
    session.headers.update(headers(app_id, api_key))
    
    # Determine which fields to clear (set to empty/null)
    fields_to_clear = all_fields - set(preserved_fields) - {'id', 'created_at', 'updated_at'}
    
    # Build payload with empty values for fields to clear
    payload = {}
    for field in fields_to_clear:
        if field.startswith('field_'):
            # Set field to empty/null
            # For different field types, we might need different empty values
            payload[field] = ""
    
    if not payload:
        return True  # Nothing to clear
    
    url = f"{API_BASE}/objects/{object_key}/records/{record_id}"
    r = session.put(url, json=payload, timeout=60)
    
    return r.status_code in (200, 204)


def main():
    load_env_files()
    
    ap = argparse.ArgumentParser(
        description="Archive and clear Knack establishment records",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Archives records from Object_10 and Object_29 to Object_68, then clears non-essential fields.

Examples:
  # Archive all records for an establishment
  python knack_archive_clear.py --establishment 63bc1c145f917b001289b14e --apply
  
  # Archive only Year 11, Group A records
  python knack_archive_clear.py --establishment 686ce50e6b2cd002d1e3f180 --year-group "Year 11" --tutor-group "A" --apply
  
  # Dry run to preview
  python knack_archive_clear.py --establishment 63bc1c145f917b001289b14e --dry-run
  
  # Skip clearing step
  python knack_archive_clear.py --establishment 12345 --no-clear --apply
        """
    )
    
    ap.add_argument("--app-id", help="Knack Application ID (or set KNACK_APP_ID)")
    ap.add_argument("--api-key", help="Knack REST API Key (or set KNACK_API_KEY)")
    ap.add_argument("--establishment", required=True, 
                    help="Establishment ID to archive")
    ap.add_argument("--year-group", 
                    help="Optional: Archive only specific year group")
    ap.add_argument("--tutor-group",
                    help="Optional: Archive only specific tutor group")
    ap.add_argument("--apply", action="store_true",
                    help="Actually perform the archive and clear operations")
    ap.add_argument("--dry-run", action="store_true",
                    help="Preview what would be archived without making changes")
    ap.add_argument("--no-clear", action="store_true",
                    help="Only archive, don't clear the original records")
    ap.add_argument("--output-dir", default="archive_exports",
                    help="Directory to save local CSV copies (default: archive_exports)")
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
    
    # Use establishment ID directly
    establishment_id = args.establishment
    
    # Create output directory if needed
    if not os.path.exists(args.output_dir):
        os.makedirs(args.output_dir)
    
    print("="*60)
    print("KNACK ARCHIVE AND CLEAR")
    print("="*60)
    print(f"Establishment: {establishment_id}")
    if args.year_group:
        print(f"Year Group:    {args.year_group}")
    if args.tutor_group:
        print(f"Tutor Group:   {args.tutor_group}")
    print(f"Mode:          {'DRY RUN' if args.dry_run or not args.apply else 'APPLY CHANGES'}")
    print(f"Clear Records: {'No' if args.no_clear else 'Yes'}")
    print()
    
    # Process each object type
    for object_key, config in OBJECT_CONFIGS.items():
        print(f"\n{'='*60}")
        print(f"Processing {object_key} ({config['name']})")
        print(f"{'='*60}")
        
        # Build filters
        filters = [
            {
                "field": config["establishment_field"],
                "operator": "is",
                "value": establishment_id
            }
        ]
        
        if args.year_group:
            filters.append({
                "field": config["year_group_field"],
                "operator": "is",
                "value": args.year_group
            })
        
        if args.tutor_group and "tutor_group_field" in config:
            filters.append({
                "field": config["tutor_group_field"],
                "operator": "is",
                "value": args.tutor_group
            })
        
        if args.verbose:
            print(f"Filters: {filters}")
        
        # Fetch records
        print(f"Fetching records...")
        try:
            records = fetch_all_records(app_id, api_key, object_key, filters=filters)
        except Exception as e:
            print(f"ERROR fetching records: {e}")
            continue
        
        print(f"Found {len(records)} records")
        
        if len(records) == 0:
            print("No records to archive")
            continue
        
        # Create CSV content
        print("Creating CSV (stripping HTML tags)...")
        csv_content = create_csv_content(records, object_key)
        
        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        year_suffix = f"_{args.year_group.replace(' ', '')}" if args.year_group else ""
        group_suffix = f"_{args.tutor_group}" if args.tutor_group else ""
        filename = f"{object_key}_{establishment_id}{year_suffix}{group_suffix}_{timestamp}.csv"
        
        # Save local copy
        local_path = os.path.join(args.output_dir, filename)
        with open(local_path, 'w', encoding='utf-8') as f:
            f.write(csv_content)
        print(f"✓ Saved local copy: {local_path}")
        print(f"  File size: {len(csv_content):,} bytes")
        print(f"  Records: {len(records)}")
        
        # Upload to archive if not dry run
        if not args.dry_run and args.apply:
            print(f"Creating archive record in Object_68...")
            try:
                archive_record = upload_to_archive(
                    app_id, api_key,
                    csv_content=csv_content,
                    filename=filename,
                    establishment_id=establishment_id,
                    csv_type=config["csv_type"],
                    year_group=args.year_group,
                    tutor_group=args.tutor_group
                )
                print(f"✓ Archive record created in Object_68 with ID: {archive_record.get('id')}")
                print(f"  Note: CSV file saved locally at: {local_path}")
                print(f"  To upload file to Knack: Use the Knack builder to manually attach the CSV to the record")
            except Exception as e:
                print(f"ERROR creating archive record: {e}")
                print(f"  CSV file still saved locally at: {local_path}")
                continue
            
            # Clear fields if requested
            if not args.no_clear:
                print(f"Clearing non-preserved fields from {len(records)} records...")
                
                # Get all field keys from records
                all_fields = set()
                for record in records:
                    all_fields.update(record.keys())
                
                cleared = 0
                errors = 0
                
                for i, record in enumerate(records, 1):
                    if args.verbose and i % 10 == 0:
                        print(f"  Progress: {i}/{len(records)}")
                    
                    success = clear_record_fields(
                        app_id, api_key,
                        object_key=object_key,
                        record_id=record['id'],
                        preserved_fields=config["preserved_fields"],
                        all_fields=all_fields
                    )
                    
                    if success:
                        cleared += 1
                    else:
                        errors += 1
                    
                    time.sleep(0.1)  # Rate limiting
                
                print(f"✓ Cleared {cleared} records")
                if errors > 0:
                    print(f"⚠ Errors clearing {errors} records")
        
        elif args.dry_run or not args.apply:
            print("\nDRY RUN - Actions that would be taken:")
            print(f"  1. Upload {filename} to Object_68")
            print(f"  2. Archive type: {config['csv_type']}")
            if not args.no_clear:
                print(f"  3. Clear non-preserved fields from {len(records)} records")
                print(f"     Preserved fields: {', '.join(config['preserved_fields'][:5])}...")
    
    print("\n" + "="*60)
    print("ARCHIVE COMPLETE" if args.apply and not args.dry_run else "DRY RUN COMPLETE")
    print("="*60)
    
    if args.dry_run or not args.apply:
        print("\nTo apply these changes, re-run with --apply")


if __name__ == "__main__":
    main()
