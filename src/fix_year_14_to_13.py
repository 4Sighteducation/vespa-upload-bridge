#!/usr/bin/env python3
"""Emergency fix: Change Year 14 back to Year 13 and 14X back to 13X"""

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

# Fix Object_10
print("Fixing Object_10 - changing 14 back to 13...")
filters = {
    "match": "and",
    "rules": [{"field": "field_133", "operator": "is", "value": establishment_id}]
}
params = {
    "filters": json.dumps(filters),
    "rows_per_page": 1000
}

url = f"{API_BASE}/objects/object_10/records"
response = requests.get(url, headers=headers, params=params)
records = response.json().get('records', [])

print(f"Found {len(records)} records")

updated = 0
for i, record in enumerate(records, 1):
    update_payload = {}
    
    # Fix year field (14 → 13)
    current_year = record.get('field_144')
    if current_year and '14' in str(current_year):
        new_year = str(current_year).replace('14', '13')
        update_payload['field_144'] = int(new_year) if isinstance(current_year, int) else new_year
    
    # Fix group field (14X → 13X)
    current_group = record.get('field_223', '')
    if current_group and '14' in str(current_group):
        new_group = str(current_group).replace('14', '13')
        update_payload['field_223'] = new_group
    
    if update_payload:
        update_url = f"{API_BASE}/objects/object_10/records/{record['id']}"
        r = requests.put(update_url, headers=headers, json=update_payload)
        if r.status_code in (200, 204):
            updated += 1
            if updated % 10 == 0:
                print(f"  Fixed {updated} records...")
        time.sleep(0.1)

print(f"✓ Fixed {updated} Object_10 records (14→13)")
