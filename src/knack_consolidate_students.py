#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Knack Student Consolidation - Complete validation and reconciliation of student accounts

This script validates the complete student data chain across 4 objects:
  Object_3 (User Accounts) → Object_6 (Student Profiles) → Object_10 (Results) → Object_29 (Questionnaires)

Data Flow:
----------
1. Object_3: User account with role="Student"
2. Object_6: Student profile (should exist for each Object_3 student)
3. Object_10: VESPA Results (connected from Object_6 via field_182)
4. Object_29: Questionnaires (connected to Object_10 via field_792)

Features:
---------
- Validates complete chain integrity
- Identifies missing records at each level
- Detects broken connections
- Finds duplicates across all objects
- Can create missing records and fix connections
- Detailed reporting of all discrepancies

Field Mappings:
--------------
Object_3: email=field_70, name=field_69, establishment=field_122, group=field_708, 
          year=field_550, role=field_73
Object_6: email=field_91, name=field_90, establishment=field_179, group=field_565,
          year=field_548, connection_to_10=field_182
Object_10: email=field_197, name=field_187, establishment=field_133, group=field_223,
           year=field_144
Object_29: email=field_2732, name=field_1823, establishment=field_1821, group=field_1824,
           year=field_1826, connection_to_10=field_792
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

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

try:
    from knack_establishment_lookup import get_establishment_id, get_establishment_name
except ImportError:
    get_establishment_id = None
    get_establishment_name = None

API_BASE = "https://api.knack.com/v1"

# Complete object configurations
OBJECT_CONFIGS = {
    "object_3": {
        "name": "User Accounts",
        "email_field": "field_70",
        "name_field": "field_69",
        "establishment_field": "field_122",
        "year_group_field": "field_550",
        "tutor_group_field": "field_708",
        "role_field": "field_73",  # Should be "Student"
    },
    "object_6": {
        "name": "Student Profiles",
        "email_field": "field_91",
        "name_field": "field_90",
        "establishment_field": "field_179",
        "year_group_field": "field_548",
        "tutor_group_field": "field_565",
        "connection_to_10": "field_182",  # Connection to Object_10
    },
    "object_10": {
        "name": "VESPA Results",
        "email_field": "field_197",
        "name_field": "field_187",
        "establishment_field": "field_133",
        "year_group_field": "field_144",
        "tutor_group_field": "field_223",
    },
    "object_29": {
        "name": "Questionnaire Responses",
        "email_field": "field_2732",
        "name_field": "field_1823",
        "establishment_field": "field_1821",
        "year_group_field": "field_1826",
        "tutor_group_field": "field_1824",
        "connection_to_10": "field_792",  # Connection to Object_10
    }
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
        if 'first' in raw and 'last' in raw:
            first = raw.get('first', '').strip()
            last = raw.get('last', '').strip()
            return f"{first} {last}".strip()
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


def check_student_role(record: Dict[str, Any], role_field: str) -> bool:
    """Check if record has ONLY 'Student' role"""
    role_value = record.get(role_field)
    
    if not role_value:
        return False
    
    if isinstance(role_value, str):
        role_clean = re.sub('<.*?>', '', role_value).strip()
        return role_clean.lower() == "student"
    
    if isinstance(role_value, list):
        if len(role_value) == 1:
            role_item = role_value[0]
            if isinstance(role_item, str):
                return role_item.strip().lower() == "student"
            elif isinstance(role_item, dict):
                val = role_item.get("value") or role_item.get("identifier") or ""
                return val.strip().lower() == "student"
        return False
    
    if isinstance(role_value, dict):
        val = role_value.get("value") or role_value.get("identifier") or ""
        return val.strip().lower() == "student"
    
    return False


def fetch_all_records(app_id: str, api_key: str, object_key: str,
                      filters: Optional[List[Dict[str, str]]] = None,
                      rows_per_page: int = 1000) -> List[Dict[str, Any]]:
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
        
        if page > 100:  # Safety limit
            break
        
        time.sleep(0.2)
    
    return all_records


def consolidate_students(records_by_object: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Any]:
    """
    Perform complete student consolidation across all 4 objects
    
    Expected chain: Object_3 → Object_6 → Object_10 → Object_29
    """
    
    # Index all records by email and ID
    indexed = {}
    
    for obj_key, records in records_by_object.items():
        config = OBJECT_CONFIGS[obj_key]
        email_field = config["email_field"]
        name_field = config["name_field"]
        
        by_email = {}
        by_id = {}
        
        for rec in records:
            email = extract_email_value(rec, email_field)
            name = extract_name_value(rec, name_field)
            rec_id = rec.get("id")
            
            by_id[rec_id] = rec
            
            if email:
                if email not in by_email:
                    by_email[email] = []
                by_email[email].append(rec)
        
        indexed[obj_key] = {
            "by_email": by_email,
            "by_id": by_id,
            "all": records
        }
    
    # Filter Object_3 for student-only accounts
    students_obj3 = []
    for rec in indexed["object_3"]["all"]:
        if check_student_role(rec, OBJECT_CONFIGS["object_3"]["role_field"]):
            students_obj3.append(rec)
    
    # Build results structure
    results = {
        "total_counts": {
            "object_3_students": len(students_obj3),
            "object_6": len(indexed["object_6"]["all"]),
            "object_10": len(indexed["object_10"]["all"]),
            "object_29": len(indexed["object_29"]["all"]),
        },
        "complete_chain": [],  # Students with complete chain
        "issues": {
            "obj3_missing_obj6": [],  # Object_3 students without Object_6 profile
            "obj6_missing_obj10": [],  # Object_6 profiles without Object_10 connection
            "obj10_missing_obj29": [],  # Object_10 records without Object_29
            "orphaned_obj6": [],  # Object_6 without matching Object_3
            "orphaned_obj10": [],  # Object_10 without matching Object_6
            "orphaned_obj29": [],  # Object_29 without valid connection
            "email_mismatches": [],  # Email doesn't match across chain
            "name_discrepancies": [],  # Object_29 names don't match Object_6
        },
        "duplicates": {
            "object_3": [],
            "object_6": [],
            "object_10": [],
            "object_29": [],
        }
    }
    
    # Track which records are part of chains (complete or partial)
    chained_obj10_ids = set()
    chained_obj29_ids = set()
    chained_obj6_ids = set()
    
    # Find duplicates in each object
    for obj_key in ["object_3", "object_6", "object_10", "object_29"]:
        email_groups = indexed[obj_key]["by_email"]
        for email, recs in email_groups.items():
            if len(recs) > 1:
                for rec in recs:
                    name = extract_name_value(rec, OBJECT_CONFIGS[obj_key]["name_field"])
                    results["duplicates"][obj_key].append({
                        "id": rec.get("id"),
                        "email": email,
                        "name": name
                    })
    
    # Validate chain for each Object_3 student
    for obj3_rec in students_obj3:
        email = extract_email_value(obj3_rec, OBJECT_CONFIGS["object_3"]["email_field"])
        name = extract_name_value(obj3_rec, OBJECT_CONFIGS["object_3"]["name_field"])
        
        chain_status = {
            "email": email,
            "name": name,
            "obj3_id": obj3_rec.get("id"),
            "obj6_id": None,
            "obj10_id": None,
            "obj29_id": None,
            "has_obj6": False,
            "has_obj10": False,
            "has_obj29": False,
            "obj6_to_obj10_connected": False,
            "obj29_to_obj10_connected": False,
        }
        
        if not email:
            # Can't track without email
            results["issues"]["obj3_missing_obj6"].append(chain_status)
            continue
        
        # Check Object_6
        obj6_recs = indexed["object_6"]["by_email"].get(email, [])
        if obj6_recs:
            obj6_rec = obj6_recs[0]  # Take first if multiple
            chain_status["has_obj6"] = True
            chain_status["obj6_id"] = obj6_rec.get("id")
            chained_obj6_ids.add(chain_status["obj6_id"])  # Track it
            
            # Check Object_6 → Object_10 connection
            obj10_connection_id = extract_connection_id(obj6_rec, OBJECT_CONFIGS["object_6"]["connection_to_10"])
            if obj10_connection_id:
                obj10_rec = indexed["object_10"]["by_id"].get(obj10_connection_id)
                if obj10_rec:
                    chain_status["has_obj10"] = True
                    chain_status["obj10_id"] = obj10_connection_id
                    chain_status["obj6_to_obj10_connected"] = True
                    chained_obj10_ids.add(obj10_connection_id)  # Track it
                    
                    # Check Object_10 email matches
                    obj10_email = extract_email_value(obj10_rec, OBJECT_CONFIGS["object_10"]["email_field"])
                    if obj10_email != email:
                        results["issues"]["email_mismatches"].append({
                            **chain_status,
                            "expected": email,
                            "obj10_email": obj10_email
                        })
                    
                    # Check Object_29
                    obj29_recs = [r for r in indexed["object_29"]["all"]
                                 if extract_connection_id(r, OBJECT_CONFIGS["object_29"]["connection_to_10"]) == obj10_connection_id]
                    if obj29_recs:
                        obj29_rec = obj29_recs[0]
                        chain_status["has_obj29"] = True
                        chain_status["obj29_id"] = obj29_rec.get("id")
                        chain_status["obj29_to_obj10_connected"] = True
                        chained_obj29_ids.add(chain_status["obj29_id"])  # Track it
        
        # Categorize the chain status
        if chain_status["has_obj6"] and chain_status["has_obj10"] and chain_status["has_obj29"]:
            results["complete_chain"].append(chain_status)
            
            # Check for name discrepancies between Object_29 and Object_6 (source of truth)
            obj6_id = chain_status["obj6_id"]
            obj29_id = chain_status["obj29_id"]
            
            if obj6_id and obj29_id:
                obj6_rec = indexed["object_6"]["by_id"].get(obj6_id)
                obj29_rec = indexed["object_29"]["by_id"].get(obj29_id)
                
                if obj6_rec and obj29_rec:
                    # Get names from both objects
                    obj6_name_raw = obj6_rec.get("field_90_raw")
                    obj29_name_raw = obj29_rec.get("field_1823_raw")
                    
                    # Check if Object_29 name is missing or incomplete
                    needs_update = False
                    if not obj29_name_raw:
                        needs_update = True
                    elif isinstance(obj29_name_raw, dict):
                        first = obj29_name_raw.get("first", "").strip()
                        last = obj29_name_raw.get("last", "").strip()
                        if not first or not last:
                            needs_update = True
                    
                    # Also check if names don't match
                    if obj6_name_raw and obj29_name_raw and isinstance(obj6_name_raw, dict) and isinstance(obj29_name_raw, dict):
                        obj6_first = obj6_name_raw.get("first", "").strip().lower()
                        obj6_last = obj6_name_raw.get("last", "").strip().lower()
                        obj29_first = obj29_name_raw.get("first", "").strip().lower()
                        obj29_last = obj29_name_raw.get("last", "").strip().lower()
                        
                        if obj6_first != obj29_first or obj6_last != obj29_last:
                            needs_update = True
                    
                    if needs_update and obj6_name_raw:
                        results["issues"]["name_discrepancies"].append({
                            "email": email,
                            "obj6_id": obj6_id,
                            "obj29_id": obj29_id,
                            "obj6_name": extract_name_value(obj6_rec, "field_90"),
                            "obj29_name": extract_name_value(obj29_rec, "field_1823"),
                            "obj6_name_raw": obj6_name_raw,
                            "obj29_name_raw": obj29_name_raw,
                        })
        else:
            # Record issues
            if not chain_status["has_obj6"]:
                results["issues"]["obj3_missing_obj6"].append(chain_status)
            elif not chain_status["has_obj10"]:
                results["issues"]["obj6_missing_obj10"].append(chain_status)
            elif not chain_status["has_obj29"]:
                results["issues"]["obj10_missing_obj29"].append(chain_status)
    
    # Find orphaned Object_10 records (not part of any student chain)
    results["orphaned"] = {
        "object_10": [],
        "object_29": []
    }
    
    for obj10_rec in indexed["object_10"]["all"]:
        obj10_id = obj10_rec.get("id")
        if obj10_id not in chained_obj10_ids:
            email = extract_email_value(obj10_rec, OBJECT_CONFIGS["object_10"]["email_field"])
            name = extract_name_value(obj10_rec, OBJECT_CONFIGS["object_10"]["name_field"])
            results["orphaned"]["object_10"].append({
                "id": obj10_id,
                "email": email,
                "name": name,
                "record": obj10_rec
            })
    
    for obj29_rec in indexed["object_29"]["all"]:
        obj29_id = obj29_rec.get("id")
        if obj29_id not in chained_obj29_ids:
            email = extract_email_value(obj29_rec, OBJECT_CONFIGS["object_29"]["email_field"])
            name = extract_name_value(obj29_rec, OBJECT_CONFIGS["object_29"]["name_field"])
            connection_id = extract_connection_id(obj29_rec, OBJECT_CONFIGS["object_29"]["connection_to_10"])
            results["orphaned"]["object_29"].append({
                "id": obj29_id,
                "email": email,
                "name": name,
                "connection_to_10": connection_id,
                "record": obj29_rec
            })
    
    return results


def write_consolidation_report(path: str, results: Dict[str, Any]) -> None:
    """Write detailed consolidation report to CSV"""
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["category", "email", "name", "obj3_id", "obj6_id", "obj10_id", "obj29_id", "issue"])
        
        # Complete chains
        for item in results["complete_chain"]:
            w.writerow([
                "complete",
                item["email"],
                item["name"],
                item["obj3_id"],
                item["obj6_id"],
                item["obj10_id"],
                item["obj29_id"],
                "OK"
            ])
        
        # Issues
        for issue_type, items in results["issues"].items():
            for item in items:
                w.writerow([
                    issue_type,
                    item.get("email", ""),
                    item.get("name", ""),
                    item.get("obj3_id", ""),
                    item.get("obj6_id", ""),
                    item.get("obj10_id", ""),
                    item.get("obj29_id", ""),
                    issue_type
                ])


def create_object29_from_object10(app_id: str, api_key: str,
                                  obj10_record: Dict[str, Any],
                                  obj10_id: str,
                                  session: Optional[requests.Session] = None) -> Optional[str]:
    """
    Create a complete Object_29 record from Object_10 data with all staff connections
    
    Object_29 Field Mappings:
    - field_1821: VESPA Customer (establishment) - from Object_10 field_133
    - field_1823: Name - from Object_10 field_187
    - field_2732: Email - from Object_10 field_197
    - field_1824: Group - from Object_10 field_223
    - field_1826: Year Group - from Object_10 field_144
    - field_1827: Level - from Object_10 field_568
    - field_792: Connection to Object_10 - the obj10_id
    - field_2069: Connected Staff Admin(s) - from Object_10 field_439
    - field_2071: Connected Subject Teachers - from Object_10 field_2191
    - field_2070: Connected Tutors - from Object_10 field_145
    - field_3266: Connected Heads of Year - from Object_10 field_429
    """
    if not session:
        session = requests.Session()
        session.headers.update(headers(app_id, api_key))
    
    # Build payload
    payload = {
        # Connection to Object_10 - MOST IMPORTANT
        "field_792": obj10_id,
    }
    
    # Basic fields
    # Establishment - extract ID from HTML span or use _raw
    establishment = obj10_record.get("field_133")
    establishment_raw = obj10_record.get("field_133_raw")
    if establishment_raw:
        # Connection fields have _raw with id
        if isinstance(establishment_raw, dict) and establishment_raw.get("id"):
            payload["field_1821"] = establishment_raw["id"]
        elif isinstance(establishment_raw, list) and establishment_raw and isinstance(establishment_raw[0], dict):
            payload["field_1821"] = establishment_raw[0].get("id")
    elif establishment:
        # Try to extract from HTML
        if '<span class="' in str(establishment):
            match = re.search(r'<span class="([a-f0-9]{24})"', str(establishment))
            if match:
                payload["field_1821"] = match.group(1)
        else:
            payload["field_1821"] = establishment
    
    # Name - handle compound name field (first/last)
    name_raw = obj10_record.get("field_187_raw")
    if name_raw and isinstance(name_raw, dict):
        # Send the structured name object
        name_obj = {
            "first": name_raw.get("first", ""),
            "last": name_raw.get("last", ""),
        }
        if name_raw.get("middle"):
            name_obj["middle"] = name_raw.get("middle")
        payload["field_1823"] = name_obj
    else:
        # Fallback to display value
        name = obj10_record.get("field_187")
        if name:
            payload["field_1823"] = name
    
    email = extract_email_value(obj10_record, "field_197")
    if email:
        payload["field_2732"] = email
    
    group = obj10_record.get("field_223")
    if group:
        payload["field_1824"] = group
    
    year_group = obj10_record.get("field_144")
    if year_group:
        payload["field_1826"] = year_group
    
    level = obj10_record.get("field_568")
    if level:
        payload["field_1827"] = level
    
    # Staff connections - extract IDs from _raw format
    def extract_connection_ids(record, field_key):
        """Extract connection IDs from _raw field format"""
        raw = record.get(f"{field_key}_raw")
        if isinstance(raw, list):
            ids = []
            for item in raw:
                if isinstance(item, dict) and item.get("id"):
                    ids.append(item["id"])
            return ids if ids else None
        elif isinstance(raw, dict) and raw.get("id"):
            return [raw["id"]]
        return None
    
    staff_admin_ids = extract_connection_ids(obj10_record, "field_439")
    if staff_admin_ids:
        payload["field_2069"] = staff_admin_ids
    
    subject_teacher_ids = extract_connection_ids(obj10_record, "field_2191")
    if subject_teacher_ids:
        payload["field_2071"] = subject_teacher_ids
    
    tutor_ids = extract_connection_ids(obj10_record, "field_145")
    if tutor_ids:
        payload["field_2070"] = tutor_ids
    
    heads_of_year_ids = extract_connection_ids(obj10_record, "field_429")
    if heads_of_year_ids:
        payload["field_3266"] = heads_of_year_ids
    
    # Create the record
    url = f"{API_BASE}/objects/object_29/records"
    
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


def update_object29_name(app_id: str, api_key: str,
                        obj29_id: str,
                        name_obj: Dict[str, str],
                        session: Optional[requests.Session] = None) -> bool:
    """Update the name field in an Object_29 record"""
    if not session:
        session = requests.Session()
        session.headers.update(headers(app_id, api_key))
    
    payload = {
        "field_1823": name_obj
    }
    
    url = f"{API_BASE}/objects/object_29/records/{obj29_id}"
    
    try:
        r = session.put(url, json=payload, timeout=60)
        return r.status_code in (200, 204)
    except Exception:
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


def create_object10_from_object6(app_id: str, api_key: str,
                                 obj6_record: Dict[str, Any],
                                 obj3_record: Optional[Dict[str, Any]] = None,
                                 session: Optional[requests.Session] = None) -> Optional[str]:
    """
    Create an Object_10 record from Object_6 (and optionally Object_3) data
    
    Object_10 Field Mappings:
    - field_133: Establishment - from Object_6 field_179
    - field_187: Name - from Object_6 field_90
    - field_197: Email - from Object_6 field_91
    - field_223: Group - from Object_6 field_565
    - field_144: Year Group - from Object_6 field_548
    - field_439: Connected Staff Admin(s) - from Object_6 field_190
    - field_2191: Connected Subject Teachers - from Object_6 field_2177
    - field_145: Connected Tutors - from Object_6 field_1682
    - field_429: Connected Heads of Year - from Object_6 field_547
    """
    if not session:
        session = requests.Session()
        session.headers.update(headers(app_id, api_key))
    
    # Build payload
    payload = {}
    
    # Basic fields from Object_6
    establishment = obj6_record.get("field_179")
    if establishment:
        payload["field_133"] = establishment
    
    name = obj6_record.get("field_90")
    if name:
        payload["field_187"] = name
    
    email = extract_email_value(obj6_record, "field_91")
    if email:
        payload["field_197"] = email
    
    group = obj6_record.get("field_565")
    if group:
        payload["field_223"] = group
    
    year_group = obj6_record.get("field_548")
    if year_group:
        payload["field_144"] = year_group
    
    # Staff connections from Object_6
    staff_admin = obj6_record.get("field_190")
    if staff_admin:
        payload["field_439"] = staff_admin
    
    subject_teachers = obj6_record.get("field_2177")
    if subject_teachers:
        payload["field_2191"] = subject_teachers
    
    tutors = obj6_record.get("field_1682")
    if tutors:
        payload["field_145"] = tutors
    
    heads_of_year = obj6_record.get("field_547")
    if heads_of_year:
        payload["field_429"] = heads_of_year
    
    # Create the record
    url = f"{API_BASE}/objects/object_10/records"
    
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


def main():
    load_env_files()
    
    ap = argparse.ArgumentParser(
        description="Complete student consolidation across all 4 objects",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Validates the complete student chain:
  Object_3 (User Account) → Object_6 (Profile) → Object_10 (Results) → Object_29 (Questionnaires)

Examples:
  # Check consolidation for an establishment
  python knack_consolidate_students.py --establishment 61116a30966757001e1e7ead
  
  # Generate detailed report
  python knack_consolidate_students.py --establishment "St Bede" --report consolidation.csv
        """
    )
    
    ap.add_argument("--app-id", help="Knack Application ID (or set KNACK_APP_ID)")
    ap.add_argument("--api-key", help="Knack REST API Key (or set KNACK_API_KEY)")
    ap.add_argument("--establishment", required=True,
                    help="Establishment ID or name")
    ap.add_argument("--report",
                    help="Save consolidation report to CSV file")
    ap.add_argument("--fix-create-obj29", action="store_true",
                    help="Create missing Object_29 records from Object_10 data")
    ap.add_argument("--fix-create-obj10", action="store_true",
                    help="Create missing Object_10 records from Object_6 data")
    ap.add_argument("--fix-update-names", action="store_true",
                    help="Update Object_29 names from Object_6 (source of truth)")
    ap.add_argument("--fix-delete-orphans", action="store_true",
                    help="Delete orphaned Object_10 and Object_29 records not connected to any student")
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
    print("KNACK STUDENT CONSOLIDATION")
    print("="*80)
    print(f"Establishment: {establishment_name or establishment_id}")
    print(f"Validating:    Object_3 → Object_6 → Object_10 → Object_29")
    print()
    
    # Fetch records from all objects
    records_by_object = {}
    
    for obj_key in ["object_3", "object_6", "object_10", "object_29"]:
        config = OBJECT_CONFIGS[obj_key]
        print(f"Fetching {obj_key} ({config['name']})...")
        
        filters = [{
            "field": config["establishment_field"],
            "operator": "is",
            "value": establishment_id
        }]
        
        try:
            records = fetch_all_records(app_id, api_key, obj_key, filters=filters)
            records_by_object[obj_key] = records
            print(f"✓ Found {len(records)} records")
        except Exception as e:
            print(f"ERROR fetching {obj_key}: {e}")
            sys.exit(1)
    
    # Perform consolidation
    print("\nAnalyzing student chains...")
    results = consolidate_students(records_by_object)
    
    # Print summary
    print("\n" + "="*80)
    print("CONSOLIDATION SUMMARY")
    print("="*80)
    print(f"Object_3 (Student accounts):        {results['total_counts']['object_3_students']}")
    print(f"Object_6 (Student profiles):        {results['total_counts']['object_6']}")
    print(f"Object_10 (VESPA Results):          {results['total_counts']['object_10']}")
    print(f"Object_29 (Questionnaires):         {results['total_counts']['object_29']}")
    print()
    print(f"✓ Complete chains (Obj3→6→10→29):  {len(results['complete_chain'])}")
    print()
    print("ISSUES FOUND:")
    print(f"⚠ Obj3 students missing Obj6:       {len(results['issues']['obj3_missing_obj6'])}")
    print(f"⚠ Obj6 profiles missing Obj10:      {len(results['issues']['obj6_missing_obj10'])}")
    print(f"⚠ Obj10 records missing Obj29:      {len(results['issues']['obj10_missing_obj29'])}")
    print(f"⚠ Email mismatches in chain:        {len(results['issues']['email_mismatches'])}")
    print(f"⚠ Name discrepancies (Obj29≠Obj6):  {len(results['issues']['name_discrepancies'])}")
    print()
    print("DUPLICATES:")
    print(f"⚠ Object_3 duplicates:              {len(results['duplicates']['object_3'])}")
    print(f"⚠ Object_6 duplicates:              {len(results['duplicates']['object_6'])}")
    print(f"⚠ Object_10 duplicates:             {len(results['duplicates']['object_10'])}")
    print(f"⚠ Object_29 duplicates:             {len(results['duplicates']['object_29'])}")
    print()
    print("ORPHANED RECORDS (not part of any student chain):")
    print(f"⚠ Object_10 orphans:                {len(results['orphaned']['object_10'])}")
    print(f"⚠ Object_29 orphans:                {len(results['orphaned']['object_29'])}")
    
    # Show details
    if results['issues']['obj3_missing_obj6']:
        print("\n" + "-"*80)
        print(f"OBJECT_3 STUDENTS MISSING OBJECT_6 PROFILES ({len(results['issues']['obj3_missing_obj6'])})")
        print("-"*80)
        for i, item in enumerate(results['issues']['obj3_missing_obj6'][:10], 1):
            print(f"  {i}. {item['name']} ({item['email']})")
        if len(results['issues']['obj3_missing_obj6']) > 10:
            print(f"  ... and {len(results['issues']['obj3_missing_obj6']) - 10} more")
    
    if results['issues']['obj6_missing_obj10']:
        print("\n" + "-"*80)
        print(f"OBJECT_6 PROFILES MISSING OBJECT_10 CONNECTION ({len(results['issues']['obj6_missing_obj10'])})")
        print("-"*80)
        for i, item in enumerate(results['issues']['obj6_missing_obj10'][:10], 1):
            print(f"  {i}. {item['name']} ({item['email']})")
        if len(results['issues']['obj6_missing_obj10']) > 10:
            print(f"  ... and {len(results['issues']['obj6_missing_obj10']) - 10} more")
    
    if results['issues']['obj10_missing_obj29']:
        print("\n" + "-"*80)
        print(f"OBJECT_10 RECORDS MISSING OBJECT_29 ({len(results['issues']['obj10_missing_obj29'])})")
        print("-"*80)
        for i, item in enumerate(results['issues']['obj10_missing_obj29'][:10], 1):
            print(f"  {i}. {item['name']} ({item['email']})")
        if len(results['issues']['obj10_missing_obj29']) > 10:
            print(f"  ... and {len(results['issues']['obj10_missing_obj29']) - 10} more")
    
    if results['issues']['name_discrepancies']:
        print("\n" + "-"*80)
        print(f"NAME DISCREPANCIES: OBJECT_29 ≠ OBJECT_6 ({len(results['issues']['name_discrepancies'])})")
        print("-"*80)
        print("Object_6 is the source of truth. These Object_29 records have incorrect/incomplete names:")
        for i, item in enumerate(results['issues']['name_discrepancies'][:10], 1):
            print(f"  {i}. Email: {item['email']}")
            print(f"     Object_6 (correct):  {item['obj6_name']}")
            print(f"     Object_29 (current): {item['obj29_name']}")
        if len(results['issues']['name_discrepancies']) > 10:
            print(f"  ... and {len(results['issues']['name_discrepancies']) - 10} more")
    
    if results['orphaned']['object_10']:
        print("\n" + "-"*80)
        print(f"ORPHANED OBJECT_10 RECORDS ({len(results['orphaned']['object_10'])})")
        print("-"*80)
        print("These Object_10 records are NOT connected to any current student:")
        for i, item in enumerate(results['orphaned']['object_10'], 1):
            print(f"  {i}. {item['name']} ({item['email'] or 'no email'})")
            if args.verbose:
                print(f"     ID: {item['id']}")
        print("These may be old student records that should be archived or deleted.")
    
    if results['orphaned']['object_29']:
        print("\n" + "-"*80)
        print(f"ORPHANED OBJECT_29 RECORDS ({len(results['orphaned']['object_29'])})")
        print("-"*80)
        print("These Object_29 records are NOT connected to any current student:")
        for i, item in enumerate(results['orphaned']['object_29'], 1):
            print(f"  {i}. {item['name']} ({item['email'] or 'no email'})")
            if args.verbose:
                print(f"     ID: {item['id']}")
                print(f"     Connection to Obj10: {item['connection_to_10'] or 'none'}")
        print("These may be old student records that should be archived or deleted.")
    
    # Write report
    if args.report:
        write_consolidation_report(args.report, results)
        print(f"\n✓ Consolidation report saved to: {args.report}")
    
    # Apply fixes if requested
    if args.fix_update_names and results['issues']['name_discrepancies']:
        print("\n" + "="*80)
        print("FIX: UPDATE OBJECT_29 NAMES FROM OBJECT_6")
        print("="*80)
        
        name_issues = results['issues']['name_discrepancies']
        
        if not args.apply:
            print("\nDRY RUN - Would update Object_29 names for:")
            for i, item in enumerate(name_issues[:10], 1):
                print(f"  {i}. {item['email']}")
                print(f"     From: {item['obj29_name']}")
                print(f"     To:   {item['obj6_name']}")
            if len(name_issues) > 10:
                print(f"  ... and {len(name_issues) - 10} more")
            print("\nTo apply, re-run with --apply")
        else:
            confirm = input(f"\n✓ About to update {len(name_issues)} Object_29 name fields. Type 'UPDATE' to confirm: ").strip()
            if confirm != "UPDATE":
                print("Aborted.")
            else:
                session = requests.Session()
                session.headers.update(headers(app_id, api_key))
                
                updated = 0
                errors = 0
                
                for i, item in enumerate(name_issues, 1):
                    obj6_name_raw = item['obj6_name_raw']
                    obj29_id = item['obj29_id']
                    
                    if not isinstance(obj6_name_raw, dict):
                        print(f"[{i}/{len(name_issues)}] SKIP: {item['email']} - invalid name format")
                        errors += 1
                        continue
                    
                    # Build proper name object
                    name_obj = {
                        "first": obj6_name_raw.get("first", ""),
                        "last": obj6_name_raw.get("last", ""),
                    }
                    if obj6_name_raw.get("middle"):
                        name_obj["middle"] = obj6_name_raw.get("middle")
                    
                    print(f"[{i}/{len(name_issues)}] Updating {item['email']}: {item['obj29_name']} → {item['obj6_name']}")
                    
                    if update_object29_name(app_id, api_key, obj29_id, name_obj, session):
                        updated += 1
                        print(f"  ✓ Updated")
                    else:
                        errors += 1
                        print(f"  ✗ Failed")
                    
                    time.sleep(0.2)  # Rate limiting
                
                print(f"\n✓ Updated {updated} name fields")
                if errors > 0:
                    print(f"⚠ {errors} errors occurred")
    
    if args.fix_create_obj29 and results['issues']['obj10_missing_obj29']:
        print("\n" + "="*80)
        print("FIX: CREATE MISSING OBJECT_29 RECORDS")
        print("="*80)
        
        missing_obj29 = results['issues']['obj10_missing_obj29']
        
        if not args.apply:
            print("\nDRY RUN - Would create Object_29 records for:")
            for i, item in enumerate(missing_obj29[:10], 1):
                print(f"  {i}. {item['name']} ({item['email']})")
                if args.verbose:
                    print(f"     Object_10 ID: {item['obj10_id']}")
            if len(missing_obj29) > 10:
                print(f"  ... and {len(missing_obj29) - 10} more")
            print("\nTo apply, re-run with --apply")
        else:
            confirm = input(f"\n✓ About to create {len(missing_obj29)} Object_29 records. Type 'CREATE' to confirm: ").strip()
            if confirm != "CREATE":
                print("Aborted.")
            else:
                session = requests.Session()
                session.headers.update(headers(app_id, api_key))
                
                # Need to fetch the full Object_10 records
                obj10_records_by_id = {}
                for rec in records_by_object["object_10"]:
                    obj10_records_by_id[rec.get("id")] = rec
                
                created = 0
                errors = 0
                
                for i, item in enumerate(missing_obj29, 1):
                    obj10_id = item['obj10_id']
                    obj10_record = obj10_records_by_id.get(obj10_id)
                    
                    if not obj10_record:
                        print(f"[{i}/{len(missing_obj29)}] ERROR: Could not find Object_10 record {obj10_id}")
                        errors += 1
                        continue
                    
                    print(f"[{i}/{len(missing_obj29)}] Creating Object_29 for {item['name']}...")
                    new_id = create_object29_from_object10(app_id, api_key, obj10_record, obj10_id, session)
                    
                    if new_id:
                        created += 1
                        print(f"  ✓ Created Object_29 with ID: {new_id}")
                    else:
                        errors += 1
                    
                    time.sleep(0.3)  # Rate limiting
                
                print(f"\n✓ Created {created} Object_29 records")
                if errors > 0:
                    print(f"⚠ {errors} errors occurred")
    
    if args.fix_create_obj10 and results['issues']['obj6_missing_obj10']:
        print("\n" + "="*80)
        print("FIX: CREATE MISSING OBJECT_10 RECORDS")
        print("="*80)
        
        missing_obj10 = results['issues']['obj6_missing_obj10']
        
        if not args.apply:
            print("\nDRY RUN - Would create Object_10 records for:")
            for i, item in enumerate(missing_obj10[:10], 1):
                print(f"  {i}. {item['name']} ({item['email']})")
                if args.verbose:
                    print(f"     Object_6 ID: {item['obj6_id']}")
            if len(missing_obj10) > 10:
                print(f"  ... and {len(missing_obj10) - 10} more")
            print("\nTo apply, re-run with --apply")
        else:
            confirm = input(f"\n✓ About to create {len(missing_obj10)} Object_10 records. Type 'CREATE' to confirm: ").strip()
            if confirm != "CREATE":
                print("Aborted.")
            else:
                session = requests.Session()
                session.headers.update(headers(app_id, api_key))
                
                # Need to fetch the full Object_6 records
                obj6_records_by_id = {}
                for rec in records_by_object["object_6"]:
                    obj6_records_by_id[rec.get("id")] = rec
                
                created = 0
                errors = 0
                
                for i, item in enumerate(missing_obj10, 1):
                    obj6_id = item['obj6_id']
                    obj6_record = obj6_records_by_id.get(obj6_id)
                    
                    if not obj6_record:
                        print(f"[{i}/{len(missing_obj10)}] ERROR: Could not find Object_6 record {obj6_id}")
                        errors += 1
                        continue
                    
                    print(f"[{i}/{len(missing_obj10)}] Creating Object_10 for {item['name']}...")
                    new_id = create_object10_from_object6(app_id, api_key, obj6_record, None, session)
                    
                    if new_id:
                        created += 1
                        print(f"  ✓ Created Object_10 with ID: {new_id}")
                        # TODO: Update Object_6 field_182 to connect to this new Object_10 record
                    else:
                        errors += 1
                    
                    time.sleep(0.3)  # Rate limiting
                
                print(f"\n✓ Created {created} Object_10 records")
                if errors > 0:
                    print(f"⚠ {errors} errors occurred")
                
                if created > 0:
                    print("\n⚠ NOTE: You should also update Object_6 field_182 to connect to the new Object_10 records")
    
    if args.fix_delete_orphans and (results['orphaned']['object_10'] or results['orphaned']['object_29']):
        print("\n" + "="*80)
        print("FIX: DELETE ORPHANED RECORDS")
        print("="*80)
        
        total_orphans = len(results['orphaned']['object_10']) + len(results['orphaned']['object_29'])
        
        if not args.apply:
            print(f"\nDRY RUN - Would delete {total_orphans} orphaned records:")
            print(f"  - Object_10: {len(results['orphaned']['object_10'])} records")
            print(f"  - Object_29: {len(results['orphaned']['object_29'])} records")
            
            if results['orphaned']['object_10']:
                print("\nObject_10 orphans:")
                for i, item in enumerate(results['orphaned']['object_10'][:5], 1):
                    print(f"  {i}. {item['name'] or '(no name)'} ({item['email'] or 'no email'})")
            
            if results['orphaned']['object_29']:
                print("\nObject_29 orphans:")
                for i, item in enumerate(results['orphaned']['object_29'][:5], 1):
                    print(f"  {i}. {item['name'] or '(no name)'} ({item['email'] or 'no email'})")
            
            print("\nTo apply, re-run with --apply")
        else:
            print(f"\n⚠ WARNING: About to delete {total_orphans} orphaned records!")
            print("These records are NOT connected to any current student (Object_3).")
            confirm = input("\nType 'DELETE' to confirm deletion: ").strip()
            if confirm != "DELETE":
                print("Aborted.")
            else:
                session = requests.Session()
                session.headers.update(headers(app_id, api_key))
                
                deleted_obj10 = 0
                deleted_obj29 = 0
                errors = 0
                
                # Delete Object_29 orphans first (to avoid breaking connections)
                if results['orphaned']['object_29']:
                    print(f"\nDeleting {len(results['orphaned']['object_29'])} Object_29 orphans...")
                    for i, item in enumerate(results['orphaned']['object_29'], 1):
                        print(f"  [{i}/{len(results['orphaned']['object_29'])}] Deleting {item['name'] or item['email'] or item['id']}...")
                        if delete_record(app_id, api_key, "object_29", item['id'], session):
                            deleted_obj29 += 1
                            print(f"    ✓ Deleted")
                        else:
                            errors += 1
                            print(f"    ✗ Failed")
                        time.sleep(0.3)
                
                # Delete Object_10 orphans
                if results['orphaned']['object_10']:
                    print(f"\nDeleting {len(results['orphaned']['object_10'])} Object_10 orphans...")
                    for i, item in enumerate(results['orphaned']['object_10'], 1):
                        print(f"  [{i}/{len(results['orphaned']['object_10'])}] Deleting {item['name'] or item['email'] or item['id']}...")
                        if delete_record(app_id, api_key, "object_10", item['id'], session):
                            deleted_obj10 += 1
                            print(f"    ✓ Deleted")
                        else:
                            errors += 1
                            print(f"    ✗ Failed")
                        time.sleep(0.3)
                
                print(f"\n✓ Deleted {deleted_obj10} Object_10 records")
                print(f"✓ Deleted {deleted_obj29} Object_29 records")
                if errors > 0:
                    print(f"⚠ {errors} errors occurred")
    
    print("\n" + "="*80)
    print("CONSOLIDATION COMPLETE")
    print("="*80)


if __name__ == "__main__":
    main()
