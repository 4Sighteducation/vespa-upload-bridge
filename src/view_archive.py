#!/usr/bin/env python3
"""Quick script to view archived CSV files"""

import csv
import os
import sys

def view_csv_summary(filepath):
    """Show summary of a CSV file"""
    print(f"\n{'='*60}")
    print(f"File: {os.path.basename(filepath)}")
    print(f"Size: {os.path.getsize(filepath):,} bytes")
    print(f"{'='*60}")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        
        print(f"Total rows: {len(rows)}")
        
        if rows:
            print(f"\nColumns ({len(rows[0].keys())}):")
            for i, col in enumerate(rows[0].keys(), 1):
                if i <= 10:  # Show first 10 columns
                    print(f"  {i}. {col}")
            if len(rows[0].keys()) > 10:
                print(f"  ... and {len(rows[0].keys()) - 10} more columns")
            
            print(f"\nFirst 3 records:")
            for i, row in enumerate(rows[:3], 1):
                print(f"\nRecord {i}:")
                # Show a few key fields
                for field in ['id', 'field_197', 'field_2732', 'field_187', 'field_1823']:
                    if field in row:
                        value = str(row[field])[:50]  # Truncate long values
                        if len(str(row[field])) > 50:
                            value += "..."
                        print(f"  {field}: {value}")

if __name__ == "__main__":
    archive_dir = "archive_exports"
    
    if not os.path.exists(archive_dir):
        print(f"Archive directory '{archive_dir}' not found!")
        sys.exit(1)
    
    files = [f for f in os.listdir(archive_dir) if f.endswith('.csv')]
    
    if not files:
        print(f"No CSV files found in {archive_dir}")
        sys.exit(1)
    
    print(f"Found {len(files)} CSV files in {archive_dir}:")
    for f in files:
        print(f"  - {f}")
    
    # View each file
    for filename in files:
        filepath = os.path.join(archive_dir, filename)
        view_csv_summary(filepath)
    
    print(f"\n{'='*60}")
    print("All CSV files are safely stored in: archive_exports/")
    print("You can open them in Excel or upload manually to Knack")
    print(f"{'='*60}")
