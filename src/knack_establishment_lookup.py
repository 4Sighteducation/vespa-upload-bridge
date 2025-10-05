#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Knack Establishment Lookup - Search and verify establishment names and IDs

Features:
- List all establishments
- Search by name (partial match)
- Get establishment ID by name
- Verify establishment details
"""

import argparse
import sys
import os
import re
from typing import Optional, List, Dict, Any

import requests

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

API_BASE = "https://api.knack.com/v1"

# Object_2 is the Establishments object
ESTABLISHMENT_OBJECT = "object_2"
ESTABLISHMENT_NAME_FIELD = "field_44"  # Establishment name field
ESTABLISHMENT_ID_FIELD = "id"


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


def fetch_all_establishments(app_id: str, api_key: str) -> List[Dict[str, Any]]:
    """Fetch all establishments from Knack"""
    session = requests.Session()
    session.headers.update(headers(app_id, api_key))
    
    all_records = []
    page = 1
    
    while True:
        params = {"rows_per_page": 1000, "page": page}
        url = f"{API_BASE}/objects/{ESTABLISHMENT_OBJECT}/records"
        
        try:
            r = session.get(url, params=params, timeout=60)
            if r.status_code != 200:
                print(f"Warning: Error fetching page {page}: {r.status_code}")
                break
            
            data = r.json()
            records = data.get("records", [])
            
            if not records:
                break
            
            all_records.extend(records)
            page += 1
            
            if page > 100:  # Safety limit
                break
                
        except Exception as e:
            print(f"Warning: Exception fetching establishments: {e}")
            break
    
    return all_records


def extract_name(record: Dict[str, Any]) -> str:
    """Extract establishment name from record"""
    # Try common name field keys in order
    name_field_candidates = [
        'field_44',   # Establishment name field for object_2
        'field_175',  # Common name field
        'field_7',    # Another possible name field
        'field_1',    # First field often is name
        'name',       # Direct name field
    ]
    
    for field_key in name_field_candidates:
        val = record.get(field_key)
        if val:
            if isinstance(val, str):
                cleaned = val.strip()
                if cleaned:
                    return cleaned
            elif isinstance(val, dict):
                # Handle connection/object format
                text = val.get("value") or val.get("identifier") or ""
                if text:
                    return str(text).strip()
    
    # Try ALL fields looking for something that looks like a name
    for field_key, val in record.items():
        if field_key.startswith('field_'):
            if isinstance(val, str) and val.strip() and len(val) > 3 and len(val) < 100:
                # Looks like it could be a name
                return val.strip()
    
    return ""


def search_establishments(app_id: str, api_key: str, search_term: str) -> List[Dict[str, Any]]:
    """Search for establishments by name"""
    all_establishments = fetch_all_establishments(app_id, api_key)
    
    search_lower = search_term.lower()
    matches = []
    
    for record in all_establishments:
        name = extract_name(record)
        if name and search_lower in name.lower():
            matches.append({
                "id": record.get("id"),
                "name": name,
                "record": record
            })
    
    return matches


def get_establishment_id(app_id: str, api_key: str, identifier: str) -> Optional[str]:
    """
    Get establishment ID from name or verify ID
    Returns the ID if found, None otherwise
    """
    # Check if identifier is already an ID (24-char hex or numeric)
    if re.match(r'^[a-f0-9]{24}$', identifier.lower()) or identifier.isdigit():
        return identifier
    
    # Search by name
    matches = search_establishments(app_id, api_key, identifier)
    
    if len(matches) == 0:
        print(f"No establishments found matching '{identifier}'")
        return None
    
    if len(matches) == 1:
        print(f"✓ Found: {matches[0]['name']} (ID: {matches[0]['id']})")
        return matches[0]['id']
    
    # Multiple matches - let user choose
    print(f"\nFound {len(matches)} establishments matching '{identifier}':")
    print("-" * 80)
    for i, match in enumerate(matches, 1):
        print(f"{i}. {match['name']}")
        print(f"   ID: {match['id']}")
    
    return None


def get_establishment_name(app_id: str, api_key: str, establishment_id: str) -> Optional[str]:
    """Fetch establishment name by ID"""
    session = requests.Session()
    session.headers.update(headers(app_id, api_key))
    
    url = f"{API_BASE}/objects/{ESTABLISHMENT_OBJECT}/records/{establishment_id}"
    
    try:
        response = session.get(url, timeout=60)
        if response.status_code == 200:
            data = response.json()
            name = extract_name(data)
            if name:
                return name
        else:
            print(f"API returned status {response.status_code}")
    except Exception as e:
        print(f"Error fetching establishment: {e}")
    
    return None


def main():
    load_env_files()
    
    ap = argparse.ArgumentParser(
        description="Search and lookup Knack establishments",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # List all establishments
  python knack_establishment_lookup.py --list
  
  # Search for an establishment by name
  python knack_establishment_lookup.py --search "St Bede"
  
  # Verify an establishment ID
  python knack_establishment_lookup.py --verify 61116a30966757001e1e7ead
        """
    )
    
    ap.add_argument("--app-id", help="Knack Application ID (or set KNACK_APP_ID)")
    ap.add_argument("--api-key", help="Knack REST API Key (or set KNACK_API_KEY)")
    ap.add_argument("--list", action="store_true", help="List all establishments")
    ap.add_argument("--search", help="Search for establishments by name")
    ap.add_argument("--verify", help="Verify establishment ID and show name")
    
    args = ap.parse_args()
    
    # Get credentials
    app_id = args.app_id or os.getenv("KNACK_APP_ID")
    api_key = args.api_key or os.getenv("KNACK_API_KEY")
    
    if not app_id or not api_key:
        print("ERROR: Missing Knack credentials.")
        print("Provide --app-id/--api-key or set KNACK_APP_ID/KNACK_API_KEY")
        sys.exit(2)
    
    if args.list:
        print("Fetching all establishments...")
        establishments = fetch_all_establishments(app_id, api_key)
        
        print(f"\nFound {len(establishments)} establishments:")
        print("=" * 80)
        
        for est in sorted(establishments, key=lambda x: extract_name(x)):
            name = extract_name(est)
            if name:
                print(f"{name}")
                print(f"  ID: {est.get('id')}")
                print()
    
    elif args.search:
        print(f"Searching for: {args.search}")
        matches = search_establishments(app_id, api_key, args.search)
        
        if not matches:
            print("No matches found.")
            sys.exit(1)
        
        print(f"\nFound {len(matches)} match(es):")
        print("=" * 80)
        
        for match in matches:
            print(f"\n{match['name']}")
            print(f"  ID: {match['id']}")
    
    elif args.verify:
        print(f"Verifying establishment ID: {args.verify}")
        name = get_establishment_name(app_id, api_key, args.verify)
        
        if name:
            print(f"\n✓ Establishment found:")
            print(f"  Name: {name}")
            print(f"  ID:   {args.verify}")
        else:
            print("\n✗ Establishment not found or unable to retrieve name")
            sys.exit(1)
    
    else:
        ap.print_help()


if __name__ == "__main__":
    main()