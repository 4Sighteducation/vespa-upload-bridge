#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Knack Establishment Lookup Utility

Provides functions to lookup establishment IDs by name from Object_2.
Used by other Knack scripts to avoid manual ID lookups.
"""

import os
import sys
import json
import time
import requests
from typing import Dict, List, Optional, Any

# Try to import dotenv for .env file support
try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

API_BASE = "https://api.knack.com/v1"

# Object_2 configuration
ESTABLISHMENT_CONFIG = {
    "object_key": "object_2",
    "name_field": "field_44",  # Unique short text field for establishment name
    "name": "Establishments"
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


def search_establishment_by_name(app_id: str, api_key: str, name: str) -> Optional[Dict[str, Any]]:
    """
    Search for an establishment by name in Object_2.
    Returns the establishment record if found, None otherwise.
    """
    session = requests.Session()
    session.headers.update(headers(app_id, api_key))
    
    # Build filter for exact name match
    filters = [{
        "field": ESTABLISHMENT_CONFIG["name_field"],
        "operator": "is",
        "value": name
    }]
    
    params = {
        "rows_per_page": 10,
        "page": 1,
        "filters": json.dumps(filters)
    }
    
    url = f"{API_BASE}/objects/{ESTABLISHMENT_CONFIG['object_key']}/records"
    
    try:
        r = session.get(url, params=params, timeout=60)
        if r.status_code != 200:
            print(f"Error searching for establishment: {r.status_code} - {r.text}")
            return None
        
        data = r.json()
        records = data.get("records", [])
        
        if records:
            # Return the first matching record
            return records[0]
        
        return None
        
    except Exception as e:
        print(f"Exception searching for establishment: {e}")
        return None


def search_establishments_containing(app_id: str, api_key: str, search_term: str) -> List[Dict[str, Any]]:
    """
    Search for establishments with names containing the search term.
    Returns a list of matching establishment records.
    """
    session = requests.Session()
    session.headers.update(headers(app_id, api_key))
    
    # Build filter for contains match
    filters = [{
        "field": ESTABLISHMENT_CONFIG["name_field"],
        "operator": "contains",
        "value": search_term
    }]
    
    params = {
        "rows_per_page": 100,
        "page": 1,
        "filters": json.dumps(filters)
    }
    
    url = f"{API_BASE}/objects/{ESTABLISHMENT_CONFIG['object_key']}/records"
    
    try:
        r = session.get(url, params=params, timeout=60)
        if r.status_code != 200:
            print(f"Error searching establishments: {r.status_code} - {r.text}")
            return []
        
        data = r.json()
        return data.get("records", [])
        
    except Exception as e:
        print(f"Exception searching establishments: {e}")
        return []


def get_establishment_id(app_id: str, api_key: str, identifier: str) -> Optional[str]:
    """
    Get establishment ID by either ID or name.
    If identifier looks like a Knack ID (24-char hex string), returns it.
    Otherwise, looks up the establishment by name.
    
    Returns the establishment ID or None if not found.
    """
    # Check if identifier looks like a Knack ID (24-character hex string)
    # Knack IDs are typically 24 characters and contain only hex characters
    import re
    if re.match(r'^[a-f0-9]{24}$', identifier.lower()):
        return identifier
    
    # Also accept numeric IDs for backwards compatibility
    if identifier.isdigit():
        return identifier
    
    # Try exact name match first
    establishment = search_establishment_by_name(app_id, api_key, identifier)
    if establishment:
        return establishment.get("id")
    
    # If no exact match, try searching for contains
    establishments = search_establishments_containing(app_id, api_key, identifier)
    
    if not establishments:
        print(f"No establishments found matching '{identifier}'")
        return None
    
    if len(establishments) == 1:
        # Single match found
        est = establishments[0]
        name = est.get(ESTABLISHMENT_CONFIG["name_field"], "Unknown")
        print(f"Found establishment: {name} (ID: {est.get('id')})")
        return est.get("id")
    
    # Multiple matches found - show options
    print(f"\nMultiple establishments found matching '{identifier}':")
    print("-" * 60)
    for i, est in enumerate(establishments, 1):
        name = est.get(ESTABLISHMENT_CONFIG["name_field"], "Unknown")
        est_id = est.get("id")
        print(f"{i}. {name} (ID: {est_id})")
    
    print("\nPlease use the exact name or ID for your desired establishment.")
    return None


def list_all_establishments(app_id: str, api_key: str, limit: int = 100) -> List[Dict[str, Any]]:
    """
    List all establishments (up to limit).
    Returns a list of establishment records.
    """
    session = requests.Session()
    session.headers.update(headers(app_id, api_key))
    
    params = {
        "rows_per_page": limit,
        "page": 1
    }
    
    url = f"{API_BASE}/objects/{ESTABLISHMENT_CONFIG['object_key']}/records"
    
    try:
        r = session.get(url, params=params, timeout=60)
        if r.status_code != 200:
            print(f"Error listing establishments: {r.status_code} - {r.text}")
            return []
        
        data = r.json()
        return data.get("records", [])
        
    except Exception as e:
        print(f"Exception listing establishments: {e}")
        return []


def main():
    """Command-line interface for establishment lookup"""
    load_env_files()
    
    import argparse
    ap = argparse.ArgumentParser(
        description="Lookup establishment IDs by name",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Find establishment by exact name
  python knack_establishment_lookup.py "Springfield High School"
  
  # Search for establishments containing text
  python knack_establishment_lookup.py --search spring
  
  # List all establishments
  python knack_establishment_lookup.py --list
        """
    )
    
    ap.add_argument("name", nargs="?", help="Establishment name to lookup")
    ap.add_argument("--app-id", help="Knack Application ID (or set KNACK_APP_ID)")
    ap.add_argument("--api-key", help="Knack REST API Key (or set KNACK_API_KEY)")
    ap.add_argument("--search", help="Search for establishments containing this text")
    ap.add_argument("--list", action="store_true", help="List all establishments")
    ap.add_argument("--limit", type=int, default=100, help="Limit results for --list (default: 100)")
    
    args = ap.parse_args()
    
    # Get credentials
    app_id = args.app_id or os.getenv("KNACK_APP_ID")
    api_key = args.api_key or os.getenv("KNACK_API_KEY")
    
    if not app_id or not api_key:
        print("ERROR: Missing Knack credentials.")
        print("Provide --app-id/--api-key or set KNACK_APP_ID/KNACK_API_KEY")
        sys.exit(2)
    
    if args.list:
        # List all establishments
        establishments = list_all_establishments(app_id, api_key, args.limit)
        if establishments:
            print(f"\nFound {len(establishments)} establishments:")
            print("-" * 60)
            for est in establishments:
                name = est.get(ESTABLISHMENT_CONFIG["name_field"], "Unknown")
                est_id = est.get("id")
                print(f"{name} (ID: {est_id})")
        else:
            print("No establishments found")
    
    elif args.search:
        # Search for establishments
        establishments = search_establishments_containing(app_id, api_key, args.search)
        if establishments:
            print(f"\nFound {len(establishments)} establishments containing '{args.search}':")
            print("-" * 60)
            for est in establishments:
                name = est.get(ESTABLISHMENT_CONFIG["name_field"], "Unknown")
                est_id = est.get("id")
                print(f"{name} (ID: {est_id})")
        else:
            print(f"No establishments found containing '{args.search}'")
    
    elif args.name:
        # Lookup specific establishment
        est_id = get_establishment_id(app_id, api_key, args.name)
        if est_id:
            print(f"\nEstablishment ID: {est_id}")
        else:
            print(f"\nNo establishment found for '{args.name}'")
    
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
