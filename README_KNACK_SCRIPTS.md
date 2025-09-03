# Knack Data Management Scripts

A collection of Python scripts for managing Knack database records, including deduplication, archiving, and data cleanup.

## Table of Contents
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [Scripts Overview](#scripts-overview)
- [1. Deduplication Script (knack_dedupe.py)](#1-deduplication-script-knack_dedupepy)
- [2. Archive & Clear Script (knack_archive_clear.py)](#2-archive--clear-script-knack_archive_clearpy)
- [3. View Archive Script (view_archive.py)](#3-view-archive-script-view_archivepy)
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
| `knack_dedupe.py` | Remove duplicate records based on email | Auto-detects fields, filters by establishment, keeps oldest/newest |
| `knack_archive_clear.py` | Archive and clear establishment data | Exports to CSV, uploads to Object_68, clears non-essential fields |
| `view_archive.py` | View archived CSV files | Displays summary of exported data |

## 1. Deduplication Script (knack_dedupe.py)

Removes duplicate records based on email addresses with automatic field detection for known objects.

### Supported Objects
- **Object_10** (VESPA Results): email=field_197, establishment=field_133
- **Object_29** (Questionnaires): email=field_2732, establishment=field_1821
- **Object_3** (User Accounts): email=field_70, establishment=field_122

### Basic Commands

#### Dry Run (Preview - No Changes)
```powershell
# Object_10 - VESPA Results
python .\src\knack_dedupe.py `
  --object object_10 `
  --establishment 686ce50e6b2cd002d1e3f180 `
  --keep oldest `
  --backup object10_duplicates.csv

# Object_29 - Questionnaire Responses
python .\src\knack_dedupe.py `
  --object object_29 `
  --establishment 686ce50e6b2cd002d1e3f180 `
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
  --establishment 686ce50e6b2cd002d1e3f180 `
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
**Object_10**: field_133, field_439, field_187, field_137, field_197, field_143, field_568, field_223, field_2299, field_145, field_429, field_2191, field_144, field_782

**Object_29**: field_1821, field_1823, field_2732, field_2069, field_2071, field_3266, field_2070, field_792

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

## 3. View Archive Script (view_archive.py)

Quick utility to view summary of archived CSV files.

```powershell
# View all archived CSV files
python .\src\view_archive.py
```

## Common Use Cases

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

- **v1.2** - Added HTML stripping and empty column removal to archive script
- **v1.1** - Added automatic field detection for known objects
- **v1.0** - Initial release with deduplication and archive functionality

---

**Remember**: Always test with dry runs first and keep backups!
