# Knack Data Management Scripts

A collection of Python scripts for managing Knack database records, including deduplication, archiving, and data cleanup.

## Table of Contents
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [Scripts Overview](#scripts-overview)
- [1. Deduplication Script (knack_dedupe.py)](#1-deduplication-script-knack_dedupepy)
- [2. Archive & Clear Script (knack_archive_clear.py)](#2-archive--clear-script-knack_archive_clearpy)
- [3. Delete Students Script (knack_delete_students.py)](#3-delete-students-script-knack_delete_studentspy)
- [4. Establishment Lookup Script (knack_establishment_lookup.py)](#4-establishment-lookup-script-knack_establishment_lookuppy)
- [5. View Archive Script (view_archive.py)](#5-view-archive-script-view_archivepy)
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
| `knack_dedupe.py` | Remove duplicate records based on email | Auto-detects fields, filters by establishment/tutor group, keeps oldest/newest |
| `knack_archive_clear.py` | Archive and clear establishment data | Exports to CSV, uploads to Object_68, clears non-essential fields, supports tutor group |
| `knack_delete_students.py` | Delete student records | Two modes: ALL STUDENT DATA or QUESTIONNAIRE DATA only |
| `knack_establishment_lookup.py` | Find establishment IDs by name | Search establishments, list all, get IDs quickly |
| `view_archive.py` | View archived CSV files | Displays summary of exported data |

## 1. Deduplication Script (knack_dedupe.py)

Removes duplicate records based on email addresses with automatic field detection for known objects.

### Supported Objects
- **Object_10** (VESPA Results): email=field_197, establishment=field_133, tutor_group=field_223
- **Object_29** (Questionnaires): email=field_2732, establishment=field_1821, tutor_group=field_1824
- **Object_3** (User Accounts): email=field_70, establishment=field_122, tutor_group=field_708

### Basic Commands

#### Dry Run (Preview - No Changes)
```powershell
# Object_10 - VESPA Results
python .\src\knack_dedupe.py `
  --object object_10 `
  --establishment 63bc1c145f917b001289b14e `
  --keep oldest `
  --backup object10_duplicates.csv

# Object_29 - Questionnaire Responses
python .\src\knack_dedupe.py `
  --object object_29 `
  --establishment 63bc1c145f917b001289b14e `
  --keep oldest `
  --backup object29_duplicates.csv

# Object_3 - User Accounts
python .\src\knack_dedupe.py `
  --object object_3 `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --keep oldest `
  --backup object3_duplicates.csv
```

#### Apply Deletions (Actually Delete Duplicates)
```powershell
# Object_10 - Delete duplicates
python .\src\knack_dedupe.py `
  --object object_10 `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --keep oldest `
  --apply

# Object_29 - Delete duplicates
python .\src\knack_dedupe.py `
  --object object_29 `
  --establishment 63bc1c145f917b001289b14e `
  --keep oldest `
  --apply

# Object_3 - Delete duplicates
python .\src\knack_dedupe.py `
  --object object_3 `
  --establishment 686ce50e6b2cd002d1e3f180 `
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

## 2. Archive & Clear Script (knack_archive_clear.py)

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

## 3. Delete Students Script (knack_delete_students.py)

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

## 4. Establishment Lookup Script (knack_establishment_lookup.py)

Standalone utility to find establishment IDs by name - useful for getting IDs quickly in terminal.

### Basic Commands

#### Search for Establishment
```powershell
# Find establishment by partial name
python .\src\knack_establishment_lookup.py --search british

# Find establishment by exact name
python .\src\knack_establishment_lookup.py "British International School of Kuala Lumpur"

# List all establishments
python .\src\knack_establishment_lookup.py --list

# Limit results when listing
python .\src\knack_establishment_lookup.py --list --limit 50
```

### Example Output
```
Found 2 establishments containing 'british':
------------------------------------------------------------
British International School of Kuala Lumpur (ID: 686ce50e6b2cd002d1e3f180)
SAFA British School (ID: 64a7dd41a9e6170029904e3d)
```

### Command Line Options
- `name`: Establishment name to lookup (exact match)
- `--search`: Search for establishments containing this text
- `--list`: List all establishments
- `--limit`: Maximum results to show (default: 100)
- `--app-id`: Knack Application ID
- `--api-key`: Knack REST API Key

### Use Cases
```powershell
# Get ID for specific school
python .\src\knack_establishment_lookup.py "SAFA British School"

# Find all schools with "International" in name
python .\src\knack_establishment_lookup.py --search international

# Quick reference list of all establishments
python .\src\knack_establishment_lookup.py --list > establishments.txt
```

## 5. View Archive Script (view_archive.py)

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

## Version History

- **v2.0** - Added delete students script, establishment lookup utility, and tutor group filtering
- **v1.2** - Added HTML stripping and empty column removal to archive script
- **v1.1** - Added automatic field detection for known objects
- **v1.0** - Initial release with deduplication and archive functionality

---

**Remember**: Always test with dry runs first and keep backups!
