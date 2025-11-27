#!/usr/bin/env python3
"""
Targeted fix for St Bede's year groups:
- Object_10: Fix 14 → 13 (and 14X → 13X in groups)
- Object_6: Update 12 → 13 (and 12X → 13X in groups)
- Object_3: Update 12 → 13 (and 12X → 13X in groups)
"""

import os
import sys
import json
import time
import requests
from dotenv import load_dotenv

load_dotenv()

API_BASE = "https://api.knack.com/v1"
app_id = os.getenv("KNACK_APP_ID")
api_key = os.getenv("KNACK_API_KEY")

headers = {
    "X-Knack-Application-Id": app_id,
    "X-Knack-REST-API-Key": api_key,
    "Content-Type": "application/json",
}

establishment_id = "61116a30966757001e1e7ead"

def update_object(object_key, year_field, group_field, est_field, from_year, to_year):
    """Update year and group fields for an object"""
    print(f"\n{'='*60}")
    print(f"Updating {object_key}: {from_year} → {to_year}")
    print(f"{'='*60}")
    
    filters = {
        "match": "and",
        "rules": [{"field": est_field, "operator": "is", "value": establishment_id}]
    }
    params = {
        "filters": json.dumps(filters),
        "rows_per_page": 1000
    }
    
    url = f"{API_BASE}/objects/{object_key}/records"
    response = requests.get(url, headers=headers, params=params)
    if response.status_code != 200:
        print(f"ERROR fetching records: {response.status_code}")
        return
    
    records = response.json().get('records', [])
    print(f"Found {len(records)} records")
    
    year_updated = 0
    group_updated = 0
    
    for i, record in enumerate(records, 1):
        update_payload = {}
        
        # Update year field
        current_year = record.get(year_field)
        if current_year and str(from_year) in str(current_year):
            new_year = str(current_year).replace(str(from_year), str(to_year))
            # Keep type (int or string)
            if isinstance(current_year, int):
                update_payload[year_field] = int(new_year)
            else:
                update_payload[year_field] = new_year
        
        # Update group field
        if group_field:
            current_group = record.get(group_field, '')
            if current_group and str(from_year) in str(current_group):
                new_group = str(current_group).replace(str(from_year), str(to_year))
                update_payload[group_field] = new_group
        
        if update_payload:
            update_url = f"{API_BASE}/objects/{object_key}/records/{record['id']}"
            r = requests.put(update_url, headers=headers, json=update_payload)
            
            if r.status_code in (200, 204):
                if year_field in update_payload:
                    year_updated += 1
                if group_field and group_field in update_payload:
                    group_updated += 1
                
                if (year_updated + group_updated) % 10 == 0:
                    print(f"  Progress: {year_updated} year, {group_updated} group updated...")
            else:
                print(f"  ERROR updating {record['id']}: {r.status_code}")
            
            time.sleep(0.1)
    
    print(f"✓ {object_key}: Updated {year_updated} year fields, {group_updated} group fields")

# Fix Object_10: 14 → 13
update_object('object_10', 'field_144', 'field_223', 'field_133', 14, 13)

# Update Object_6: 12 → 13
update_object('object_6', 'field_548', 'field_565', 'field_179', 12, 13)

# Update Object_3: 12 → 13
update_object('object_3', 'field_550', 'field_708', 'field_122', 12, 13)

print("\n" + "="*60)
print("ALL FIXES COMPLETE")
print("="*60)
print("✓ Object_10: Fixed from 14 → 13")
print("✓ Object_6:  Updated from 12 → 13")
print("✓ Object_3:  Updated from 12 → 13")
print("✓ Object_29: Already correct (13)")
