# Knack Data Management Scripts

A collection of Python scripts for managing Knack database records, including deduplication, archiving, and data cleanup.

## 🚨 URGENT: Kellet School QR Code Issue (September 26, 2025)

**Problem**: Students getting "unable to initialize registration form" - works only on VPN  
**Root Cause**: CORS/network blocking issue (NOT rate limiting)  
**Customer ID**: 68ad56ab27597d0311a5d4e7

### Immediate Actions Required:
1. **Run**: `.\src\KELLET_IMMEDIATE_ACTION.ps1` for complete action plan
2. **Student Workarounds** (communicate immediately):
   - Use mobile data instead of school WiFi
   - Complete registration from home network
   - Continue using VPN if already connected

### Emergency Scripts Created:
- **`KELLET_IMMEDIATE_ACTION.ps1`** - Complete action plan with fixes
- **`kellet_cors_emergency_fix.ps1`** - CORS-specific diagnosis and fix
- **`kellet_urgent_investigation.ps1`** - Full diagnostic monitoring
- **`kellet_immediate_fix.ps1`** - Quick restart and scaling commands

### General QR Monitoring Tools:
- **`monitor_qr_access.ps1/.sh`** - Monitor QR code access patterns
- **`qr_diagnostic.ps1`** - Quick diagnostic command reference

---

## Table of Contents
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [Scripts Overview](#scripts-overview)
- [1. Student Consolidation Script (knack_consolidate_students.py)](#1-student-consolidation-script-knack_consolidate_studentspy) ⭐ NEW
- [2. Establishment Lookup Script (knack_establishment_lookup.py)](#2-establishment-lookup-script-knack_establishment_lookuppy)
- [3. Enhanced Archive & Clear Script (knack_archive_clear_enhanced.py)](#3-enhanced-archive--clear-script-knack_archive_clear_enhancedpy) ⭐ NEW
- [4. Object Reconciliation Script (knack_reconcile_objects.py)](#4-object-reconciliation-script-knack_reconcile_objectspy) ⭐ NEW
- [5. Deduplication Script (knack_dedupe.py)](#5-deduplication-script-knack_dedupepy)
- [6. Archive & Clear Script (knack_archive_clear.py)](#6-archive--clear-script-knack_archive_clearpy)
- [7. Delete Students Script (knack_delete_students.py)](#7-delete-students-script-knack_delete_studentspy)
- [8. View Archive Script (view_archive.py)](#8-view-archive-script-view_archivepy)
- [Common Use Cases](#common-use-cases)
- [Important Notes](#important-notes)

## Setup

### Prerequisites
```powershell
# Install required Python packages
pip install requests python-dateutil python-dotenv
```

### Create .env file (optional but recommended)
Create a `.env` file in the project root with your Knack credentials:
```
KNACK_APP_ID=your_app_id_here
KNACK_API_KEY=your_api_key_here
```

## Environment Variables

You can provide credentials in three ways (in order of precedence):
1. Command line flags: `--app-id` and `--api-key`
2. Environment variables: `KNACK_APP_ID` and `KNACK_API_KEY`
3. .env file in the script directory or parent directory

## Scripts Overview

| Script | Purpose | Main Features |
|--------|---------|---------------|
| ⭐ `knack_consolidate_students.py` | **Complete 4-object chain validation** | Validates Object_3→6→10→29 chain, detects orphans, fixes missing records, syncs names |
| `knack_establishment_lookup.py` | Find establishments by name or ID | Search, verify, list all establishments quickly |
| ⭐ `knack_archive_clear_enhanced.py` | **Enhanced archive with confirmation** | School name confirmation, year group updates (12→13), group field updates |
| ⭐ `knack_reconcile_objects.py` | Compare Object_10 ↔ Object_29 | Connection-aware comparison, populate missing emails, create records |
| `knack_dedupe.py` | Remove duplicate records by email | Auto-field detection, establishment/group filters, keeps oldest/newest |
| `knack_archive_clear.py` | Archive and clear establishment data | Exports to CSV, uploads to Object_68, clears fields |
| `knack_delete_students.py` | Delete student records | Two modes: ALL STUDENT DATA or QUESTIONNAIRE DATA |
| `view_archive.py` | View archived CSV files | Displays summary of exports |

## 1. Student Consolidation Script (knack_consolidate_students.py)

⭐ **THE MOST COMPREHENSIVE TOOL** - Validates complete student data integrity across all 4 objects.

### Overview
This script validates the complete student data chain and ensures all records are properly connected:
```
Object_3 (User Account) → Object_6 (Student Profile) → Object_10 (VESPA Results) → Object_29 (Questionnaires)
```

### What It Checks
- ✅ Every student has all 4 records
- ✅ All connections are valid (field_182, field_792)
- ✅ Names match across objects (Object_6 is source of truth)
- ✅ Emails are consistent
- ✅ No duplicate records
- ✅ No orphaned records (old/deleted students)

### Field Mappings

**Object_3 (User Accounts)**:
- Email: field_70
- Name: field_69
- Establishment: field_122
- Year Group: field_550
- Group: field_708
- Role: field_73 (should be "Student")

**Object_6 (Student Profiles)**:
- Email: field_91
- Name: field_90
- Establishment: field_179
- Year Group: field_548
- Group: field_565
- **Connection to Object_10**: field_182

**Object_10 (VESPA Results)**:
- Email: field_197
- Name: field_187
- Establishment: field_133
- Year Group: field_144
- Group: field_223

**Object_29 (Questionnaires)**:
- Email: field_2732
- Name: field_1823
- Establishment: field_1821
- Year Group: field_1826
- Group: field_1824
- **Connection to Object_10**: field_792

### Basic Commands

#### Check Consolidation Status
```powershell
# Check for an establishment (by ID)
python .\src\knack_consolidate_students.py --establishment 61116a30966757001e1e7ead

# Check for an establishment (by name)
python .\src\knack_consolidate_students.py --establishment "St Bede"

# Generate detailed report
python .\src\knack_consolidate_students.py `
  --establishment 61116a30966757001e1e7ead `
  --report consolidation_report.csv
```

#### Fix Missing Records
```powershell
# Create missing Object_29 records (dry run)
python .\src\knack_consolidate_students.py `
  --establishment 61116a30966757001e1e7ead `
  --fix-create-obj29

# Create missing Object_29 records (apply)
python .\src\knack_consolidate_students.py `
  --establishment 61116a30966757001e1e7ead `
  --fix-create-obj29 `
  --apply

# Create missing Object_10 records (if needed)
python .\src\knack_consolidate_students.py `
  --establishment 61116a30966757001e1e7ead `
  --fix-create-obj10 `
  --apply
```

#### Fix Name Discrepancies
```powershell
# Update Object_29 names from Object_6 (source of truth)
python .\src\knack_consolidate_students.py `
  --establishment 61116a30966757001e1e7ead `
  --fix-update-names `
  --apply
```

#### Delete Orphaned Records
```powershell
# Preview orphaned records
python .\src\knack_consolidate_students.py `
  --establishment 61116a30966757001e1e7ead `
  --fix-delete-orphans

# Delete orphaned records (apply)
python .\src\knack_consolidate_students.py `
  --establishment 61116a30966757001e1e7ead `
  --fix-delete-orphans `
  --apply
```

### Complete Consolidation Workflow
```powershell
# Step 1: Check current status
python .\src\knack_consolidate_students.py --establishment "St Bede" --report before.csv

# Step 2: Create any missing Object_29 records
python .\src\knack_consolidate_students.py --establishment "St Bede" --fix-create-obj29 --apply

# Step 3: Fix name discrepancies
python .\src\knack_consolidate_students.py --establishment "St Bede" --fix-update-names --apply

# Step 4: Clean up orphans
python .\src\knack_consolidate_students.py --establishment "St Bede" --fix-delete-orphans --apply

# Step 5: Verify everything is perfect
python .\src\knack_consolidate_students.py --establishment "St Bede" --report after.csv
```

### Example Output
```
CONSOLIDATION SUMMARY
Object_3 (Student accounts):        197
Object_6 (Student profiles):        197
Object_10 (VESPA Results):          197
Object_29 (Questionnaires):         197

✓ Complete chains (Obj3→6→10→29):  197

ISSUES FOUND:
⚠ Obj3 students missing Obj6:       0
⚠ Obj6 profiles missing Obj10:      0
⚠ Obj10 records missing Obj29:      0
⚠ Name discrepancies (Obj29≠Obj6):  0

ORPHANED RECORDS:
⚠ Object_10 orphans:                0
⚠ Object_29 orphans:                0
```

### Command Line Options
- `--establishment`: Establishment ID or name (required)
- `--report`: Save detailed report to CSV
- `--fix-create-obj29`: Create missing Object_29 records from Object_10 data
- `--fix-create-obj10`: Create missing Object_10 records from Object_6 data
- `--fix-update-names`: Sync Object_29 names from Object_6
- `--fix-delete-orphans`: Delete orphaned records not connected to students
- `--apply`: Actually apply fixes (without this, runs in dry-run mode)
- `--verbose`: Verbose output

## 2. Establishment Lookup Script (knack_establishment_lookup.py)

Search and verify establishments by name or ID. Essential for finding establishment IDs quickly.

### Features
- Search by partial name
- Verify establishment ID and get name
- List all establishments
- Uses Object_2 (Establishments), field_44 (name)

### Basic Commands

```powershell
# Search for establishments
python .\src\knack_establishment_lookup.py --search "St Bede"

# Verify an establishment ID
python .\src\knack_establishment_lookup.py --verify 61116a30966757001e1e7ead

# List all establishments
python .\src\knack_establishment_lookup.py --list
```

### Example Output
```
Searching for: St Bede

Found 2 match(es):
================================================================================

St Bede's and St Joseph Catholic College
  ID: 61116a30966757001e1e7ead

St Bede's College
  ID: 662bc2344c803f00261f78ac
```

## 3. Enhanced Archive & Clear Script (knack_archive_clear_enhanced.py)

⭐ Enhanced version with school name confirmation, year group updates, and group field updates (12→13).

### Features
- Displays establishment name for confirmation before proceeding
- Archives Object_10 and Object_29 to Object_68
- Clears non-essential fields
- **Updates year groups**: Yr12 → Yr13
- **Updates group fields**: Changes "12" to "13" in group fields
- Updates across Objects 10, 29, 6, and 3
- Can search by school name or use ID

### Field Updates
**Year Group Fields Updated:**
- Object_10: field_144
- Object_29: field_1826
- Object_6: field_548
- Object_3: field_550

**Group Fields Updated (12→13):**
- Object_10: field_223
- Object_29: field_1824
- Object_6: field_565
- Object_3: field_708

### Basic Commands

```powershell
# Dry run to preview (shows school name)
python .\src\knack_archive_clear_enhanced.py `
  --establishment 61116a30966757001e1e7ead `
  --update-year-group `
  --dry-run

# Archive and update year groups (by ID)
python .\src\knack_archive_clear_enhanced.py `
  --establishment 61116a30966757001e1e7ead `
  --update-year-group `
  --apply

# Archive and update year groups (by name)
python .\src\knack_archive_clear_enhanced.py `
  --establishment "St Bede" `
  --update-year-group `
  --apply

# Archive without clearing fields
python .\src\knack_archive_clear_enhanced.py `
  --establishment 61116a30966757001e1e7ead `
  --no-clear `
  --update-year-group `
  --apply

# Skip confirmation prompt
python .\src\knack_archive_clear_enhanced.py `
  --establishment 61116a30966757001e1e7ead `
  --update-year-group `
  --skip-confirmation `
  --apply
```

### Example Year Group Transitions
- `Yr12` → `Yr13`
- `Year 12` → `Year 13`
- `12` → `13`

### Example Group Field Transitions
- `12A` → `13A`
- `12B` → `13B`
- `Group 12` → `Group 13`

## 4. Object Reconciliation Script (knack_reconcile_objects.py)

Compares Object_10 (VESPA Results) and Object_29 (Questionnaires) with connection-aware logic.

### Features
- Identifies records missing from Object_29
- Detects Object_29 records with missing emails but valid connections
- Finds truly orphaned Object_29 records (no connection to Object_10)
- Can populate missing emails from connected Object_10 records
- Can create missing Object_29 records with full staff connections

### Basic Commands

```powershell
# Check Object_10 ↔ Object_29 alignment
python .\src\knack_reconcile_objects.py `
  --establishment 61116a30966757001e1e7ead `
  --report reconciliation.csv

# Populate missing emails in Object_29
python .\src\knack_reconcile_objects.py `
  --establishment 61116a30966757001e1e7ead `
  --fix-populate-emails `
  --apply

# Create missing Object_29 records
python .\src\knack_reconcile_objects.py `
  --establishment 61116a30966757001e1e7ead `
  --fix-create-29 `
  --apply

# Delete truly orphaned Object_29 records
python .\src\knack_reconcile_objects.py `
  --establishment 61116a30966757001e1e7ead `
  --fix-delete-orphans `
  --apply
```

### Understanding the Connection
Object_29 records connect to Object_10 via **field_792**. The reconciliation script:
- Recognizes connected records even without emails
- Distinguishes between "connected but missing email" vs "truly orphaned"
- Can populate emails from the connected Object_10 record

## 5. Deduplication Script (knack_dedupe.py)

Removes duplicate records based on email addresses with automatic field detection for known objects.

### Supported Objects
- **Object_10** (VESPA Results): email=field_197, establishment=field_133, tutor_group=field_223
- **Object_29** (Questionnaires): email=field_2732, establishment=field_1821, tutor_group=field_1824
- **Object_3** (User Accounts): email=field_70, establishment=field_122, tutor_group=field_708

### Basic Commands

```powershell
# Dry run - preview duplicates
python .\src\knack_dedupe.py `
  --object object_10 `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --backup duplicates.csv

# Apply - actually delete duplicates
python .\src\knack_dedupe.py `
  --object object_29 `
  --establishment 61116a30966757001e1e7ead `
  --keep oldest `
  --apply
```

#### Advanced Options
```powershell
# Keep newest records instead of oldest
python .\src\knack_dedupe.py `
  --object object_10 `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --keep newest `
  --apply

# Filter by tutor group
python .\src\knack_dedupe.py `
  --object object_29 `
  --establishment 63bc1c145f917b001289b14e `
  --tutor-group "A" `
  --apply

# Verbose output for debugging
python .\src\knack_dedupe.py `
  --object object_29 `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --verbose `
  --dry-run

# Custom object with explicit fields
python .\src\knack_dedupe.py `
  --object object_99 `
  --email-field field_123 `
  --establishment-field field_456 `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --apply

# Disable Gmail normalization (dot/plus handling)
python .\src\knack_dedupe.py `
  --object object_3 `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --no-gmail-normalize `
  --apply
```

### Command Line Options
- `--object`: Object key (e.g., object_10)
- `--email-field`: Email field key (auto-detected for known objects)
- `--establishment`: Filter by establishment ID
- `--tutor-group`: Filter by tutor group (auto-detected for known objects)
- `--establishment-field`: Explicit establishment field (overrides auto-detection)
- `--keep`: Which record to keep ('oldest' or 'newest', default: oldest)
- `--apply`: Actually delete duplicates (without this, it's a dry run)
- `--dry-run`: Explicit dry run flag
- `--backup`: Path to save CSV backup of duplicates
- `--no-gmail-normalize`: Disable Gmail-specific normalization
- `--verbose`: Verbose output
- `--app-id`: Knack Application ID
- `--api-key`: Knack REST API Key

## 6. Archive & Clear Script (knack_archive_clear.py)

Archives establishment records to CSV and Object_68, then optionally clears non-essential fields.

### Features
- Exports Object_10 and Object_29 records to CSV
- Strips HTML tags from all fields
- Removes empty columns from CSV
- Creates archive records in Object_68
- Optionally clears non-preserved fields from original records
- Saves local backup copies

### Preserved Fields
**Object_10**: field_133 (establishment), field_439 (staff admin), field_187 (name), field_137 (school ID), field_197 (email), field_143 (gender), field_568 (level), field_223 (group), field_2299, field_145 (tutors), field_429 (head of year), field_2191 (subject teachers), field_144 (year group), field_782 (faculty)

**Object_29**: field_1821 (establishment), field_1823 (name), field_2732 (email), field_2069 (staff admin), field_2071 (subject teachers), field_3266 (heads of year), field_2070 (tutors), field_792 (connected to Object_10), field_1824 (group), field_1825 (faculty), field_1826 (year group), field_1830 (gender)

### Basic Commands

#### Dry Run (Preview)
```powershell
# Preview what will be archived
python .\src\knack_archive_clear.py `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --dry-run

# Preview with verbose output
python .\src\knack_archive_clear.py `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --verbose `
  --dry-run
```

#### Archive All Records for Establishment
```powershell
# Archive and clear all records
python .\src\knack_archive_clear.py `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --apply

# Archive only (don't clear fields)
python .\src\knack_archive_clear.py `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --no-clear `
  --apply
```

#### Archive by Year Group
```powershell
# Archive only Year 11 records
python .\src\knack_archive_clear.py `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --year-group "Year 11" `
  --apply

# Archive Year 12 without clearing
python .\src\knack_archive_clear.py `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --year-group "Year 12" `
  --no-clear `
  --apply

# Archive specific tutor group
python .\src\knack_archive_clear.py `
  --establishment 63bc1c145f917b001289b14e `
  --year-group "Year 11" `
  --tutor-group "A" `
  --apply
```

#### Custom Output Directory
```powershell
# Save CSVs to custom directory
python .\src\knack_archive_clear.py `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --output-dir "C:\Backups\Knack\2025" `
  --apply
```

### Command Line Options
- `--establishment`: Establishment ID to archive (required)
- `--year-group`: Optional year group filter
- `--tutor-group`: Optional tutor group filter
- `--apply`: Actually perform operations (without this, it's a dry run)
- `--dry-run`: Preview mode (no changes)
- `--no-clear`: Only archive, don't clear original records
- `--output-dir`: Directory for CSV files (default: archive_exports)
- `--verbose`: Verbose output
- `--app-id`: Knack Application ID
- `--api-key`: Knack REST API Key

### Archive Record Structure (Object_68)
- **field_1593**: Filename
- **field_1594**: Establishment (connected)
- **field_1595**: CSV file (manual upload required)
- **field_1596**: Archived date
- **field_3653**: CSV type ('10 - results' or '29 - Questions')
- **field_3654**: Year group (if specified)
- **field_3655**: Tutor group (if specified)

## 7. Delete Students Script (knack_delete_students.py)

Deletes student records with two operational modes and multiple filtering options.

### Deletion Modes

#### Mode 1: ALL STUDENT DATA
- Deletes Object_3 accounts with ONLY "Student" role (not mixed roles)
- Finds and deletes all related records in Object_10, Object_29, Object_113 by matching email
- Complete removal of student from system

#### Mode 2: QUESTIONNAIRE DATA
- Deletes only Object_10 and Object_29 records
- Leaves Object_3 accounts intact
- Useful for clearing assessment data while keeping accounts

### Basic Commands

#### Delete All Student Data
```powershell
# Dry run - preview what will be deleted
python .\src\knack_delete_students.py `
  --mode all-student-data `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --backup students_backup.csv

# Actually delete (requires confirmation)
python .\src\knack_delete_students.py `
  --mode all-student-data `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --apply
```

#### Delete Questionnaire Data Only
```powershell
# Delete for specific year and tutor group
python .\src\knack_delete_students.py `
  --mode questionnaire-data `
  --establishment 63bc1c145f917b001289b14e `
  --year-group "Year 11" `
  --tutor-group "A" `
  --apply

# Delete all questionnaire data for establishment
python .\src\knack_delete_students.py `
  --mode questionnaire-data `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --apply
```

### Command Line Options
- `--mode`: Required. Either 'all-student-data' or 'questionnaire-data'
- `--establishment`: Establishment ID to process
- `--year-group`: Filter by year group (Object_3: field_550, Object_10: field_144, Object_29: field_1826)
- `--tutor-group`: Filter by tutor group (Object_3: field_708, Object_10: field_223, Object_29: field_1824)
- `--apply`: Actually delete records (without this, it's a dry run)
- `--backup`: Path to CSV backup file
- `--verbose`: Detailed output

### Safety Features
- Dry run by default
- Shows detailed preview of what will be deleted
- Requires typing "DELETE" to confirm when using --apply
- Creates optional CSV backup before deletion

## 8. View Archive Script (view_archive.py)

Quick utility to view summary of archived CSV files.

```powershell
# View all archived CSV files
python .\src\view_archive.py
```

## Common Use Cases

### Quick Start - Finding Establishment IDs
```powershell
# First, find your establishment ID
python .\src\knack_establishment_lookup.py --search british

# Example output:
# British International School of Kuala Lumpur (ID: 686ce50e6b2cd002d1e3f180)
# SAFA British School (ID: 64a7dd41a9e6170029904e3d)

# Then use the ID in other scripts
python .\src\knack_dedupe.py --object object_29 --establishment 64a7dd41a9e6170029904e3d
```

### Full Establishment Cleanup Workflow
```powershell
# Step 1: Remove duplicates from all objects
python .\src\knack_dedupe.py --object object_10 --establishment 686ce50e6b2cd002d1e3f180 --apply
python .\src\knack_dedupe.py --object object_29 --establishment 686ce50e6b2cd002d1e3f180 --apply
python .\src\knack_dedupe.py --object object_3 --establishment 686ce50e6b2cd002d1e3f180 --apply

# Step 2: Archive and clear data
python .\src\knack_archive_clear.py --establishment 686ce50e6b2cd002d1e3f180 --apply

# Step 3: View archived files
python .\src\view_archive.py
```

### Year-End Archive (Keep Data)
```powershell
# Archive without clearing for year-end backup
python .\src\knack_archive_clear.py `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --no-clear `
  --output-dir "YearEnd_2024" `
  --apply
```

### Test Everything First (Dry Run)
```powershell
# Test deduplication
python .\src\knack_dedupe.py `
  --object object_10 `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --backup test_duplicates.csv `
  --dry-run

# Test archiving
python .\src\knack_archive_clear.py `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --dry-run `
  --verbose
```

### Batch Processing Multiple Establishments
```powershell
# Create a list of establishment IDs
$establishments = @(
    "686ce50e6b2cd002d1e3f180",
    "686ce50e6b2cd002d1e3f181",
    "686ce50e6b2cd002d1e3f182"
)

# Process each establishment
foreach ($est in $establishments) {
    Write-Host "Processing establishment: $est"
    
    # Remove duplicates
    python .\src\knack_dedupe.py --object object_10 --establishment $est --apply
    python .\src\knack_dedupe.py --object object_29 --establishment $est --apply
    
    # Archive data
    python .\src\knack_archive_clear.py --establishment $est --apply
}
```

## Important Notes

### Safety Features
1. **Dry Run by Default**: Scripts preview changes unless `--apply` is used
2. **Confirmation Required**: Deduplication requires typing "DELETE" to confirm
3. **Local Backups**: Archive script always saves CSV files locally
4. **Rate Limiting**: Scripts respect Knack API limits

### Data Handling
- **HTML Stripping**: Archive script removes HTML tags from emails and other fields
- **Empty Column Removal**: CSV exports exclude columns with no data
- **Gmail Normalization**: Deduplication handles Gmail dots/plus addressing
- **Preserved Fields**: Critical fields are never cleared during archive operations

### Limitations
- **File Upload**: CSV files must be manually uploaded to Object_68 through Knack UI
- **API Limits**: Large datasets may take time due to rate limiting
- **Establishment Filter**: Required for safety to prevent processing all records

### Troubleshooting

#### Missing Credentials
```powershell
# Provide credentials via command line
python .\src\knack_dedupe.py `
  --app-id "your_app_id" `
  --api-key "your_api_key" `
  --object object_10 `
  --establishment 12345 `
  --apply
```

#### Check Archived Files
```powershell
# List all CSV files in archive directory
dir archive_exports\*.csv

# Open specific CSV in Excel
start archive_exports\object_10_*.csv
```

#### Restore from Archive
If you need to restore data from archived CSVs, contact your administrator. The CSV files contain all original data and can be re-imported if needed.

## Support

For issues or questions:
1. Check the verbose output: Add `--verbose` flag
2. Review dry run results before applying changes
3. Keep backup CSVs from deduplication and archiving
4. Test with a small establishment first

## Recommended End-of-Year Workflow

Use this complete workflow to transition an establishment to the next academic year:

```powershell
# Step 1: Validate student data integrity
python .\src\knack_consolidate_students.py --establishment "School Name" --report before_consolidation.csv

# Step 2: Fix any missing records or discrepancies
python .\src\knack_consolidate_students.py --establishment "School Name" --fix-create-obj29 --apply
python .\src\knack_consolidate_students.py --establishment "School Name" --fix-update-names --apply

# Step 3: Clean up orphaned records
python .\src\knack_consolidate_students.py --establishment "School Name" --fix-delete-orphans --apply

# Step 4: Verify consolidation is perfect
python .\src\knack_consolidate_students.py --establishment "School Name"

# Step 5: Remove any duplicates
python .\src\knack_dedupe_enhanced.py --object object_10 --establishment "School Name" --apply
python .\src\knack_dedupe_enhanced.py --object object_29 --establishment "School Name" --apply

# Step 6: Archive and update year groups
python .\src\knack_archive_clear_enhanced.py --establishment "School Name" --update-year-group --apply

# Step 7: Final verification
python .\src\knack_consolidate_students.py --establishment "School Name" --report after_transition.csv
```

## Version History

- **v3.0** - Added comprehensive consolidation toolkit: full 4-object chain validation, enhanced archive with year/group updates, establishment lookup, reconciliation scripts
- **v2.0** - Added delete students script, establishment lookup utility, and tutor group filtering
- **v1.2** - Added HTML stripping and empty column removal to archive script
- **v1.1** - Added automatic field detection for known objects
- **v1.0** - Initial release with deduplication and archive functionality

---

**Remember**: Always test with dry runs first and keep backups!

## Files Reference

### Python Scripts
All scripts are located in the `src/` directory:

| File | Location | Purpose |
|------|----------|---------|
| ⭐ **knack_consolidate_students.py** | `.\src\knack_consolidate_students.py` | **Complete 4-object chain validation and fixing** |
| **knack_establishment_lookup.py** | `.\src\knack_establishment_lookup.py` | Find establishment IDs by name, verify establishments |
| ⭐ **knack_archive_clear_enhanced.py** | `.\src\knack_archive_clear_enhanced.py` | **Enhanced archive with school confirmation and year updates** |
| ⭐ **knack_reconcile_objects.py** | `.\src\knack_reconcile_objects.py` | Compare Object_10 ↔ Object_29 with connection awareness |
| **knack_dedupe.py** | `.\src\knack_dedupe.py` | Remove duplicate records based on email |
| **knack_dedupe_enhanced.py** | `.\src\knack_dedupe_enhanced.py` | Enhanced deduplication with connection-based deduping |
| **knack_archive_clear.py** | `.\src\knack_archive_clear.py` | Archive establishment data to CSV and Object_68, clear fields |
| **knack_delete_students.py** | `.\src\knack_delete_students.py` | Delete student records (two modes: all data or questionnaire only) |
| **view_archive.py** | `.\src\view_archive.py` | View summary of archived CSV files |

### Configuration Files

| File | Location | Purpose |
|------|----------|---------|
| **.env** | `.\` (project root) | Store Knack credentials (KNACK_APP_ID, KNACK_API_KEY) |

### Output Directories

| Directory | Default Location | Purpose |
|-----------|-----------------|---------|
| **archive_exports** | `.\archive_exports\` | Default directory for archived CSV files |
| **Backup CSVs** | User-specified | Backup files from deduplication (e.g., `object10_duplicates.csv`) |

### Quick Access Commands

```powershell
# Navigate to scripts directory
cd .\src\

# List all Knack management scripts
dir .\src\knack_*.py

# View archived exports
dir .\archive_exports\*.csv
```