#!/usr/bin/env python3
"""Check current year group values across all objects"""

import os
import json
import requests
from collections import Counter
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

objects_to_check = [
    {'key': 'object_10', 'year_field': 'field_144', 'group_field': 'field_223', 'est_field': 'field_133'},
    {'key': 'object_29', 'year_field': 'field_1826', 'group_field': 'field_1824', 'est_field': 'field_1821'},
    {'key': 'object_6', 'year_field': 'field_548', 'group_field': 'field_565', 'est_field': 'field_179'},
    {'key': 'object_3', 'year_field': 'field_550', 'group_field': 'field_708', 'est_field': 'field_122'}
]

print("="*60)
print("CURRENT YEAR GROUP STATUS - St Bede's")
print("="*60)

for obj_config in objects_to_check:
    object_key = obj_config['key']
    year_field = obj_config['year_field']
    group_field = obj_config['group_field']
    est_field = obj_config['est_field']
    
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
    
    if response.status_code == 200:
        records = response.json().get('records', [])
        
        # Count year groups
        year_groups = [str(r.get(year_field, '')) for r in records if r.get(year_field)]
        year_counter = Counter(year_groups)
        
        # Count groups
        groups = [str(r.get(group_field, '')) for r in records if r.get(group_field)]
        group_counter = Counter(groups)
        
        print(f"\n{object_key}: {len(records)} records")
        print(f"  Year groups: {dict(year_counter)}")
        print(f"  Groups: {dict(group_counter)}")
    else:
        print(f"\n{object_key}: ERROR {response.status_code}")

print("\n" + "="*60)
