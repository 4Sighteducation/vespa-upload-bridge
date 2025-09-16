# Validation Whitelist Update for KS5 Subjects

## Issue
Some subjects were still failing validation even after prefix stripping and name mapping because the API doesn't recognize certain subject name variations.

## Solution
Implemented a two-pronged approach:
1. **Simplified subject name mappings** to more generic forms
2. **Added a whitelist** of known valid subjects that bypass API validation

## Changes Made

### Simplified Subject Name Mappings

| Original Subject | Previous Mapping | New Simplified Mapping |
|-----------------|------------------|----------------------|
| D&T (Product Design) | Design and Technology: Product Design | Design and Technology |
| Art (3D Design) | Art and Design: 3D Design | Art and Design |
| Art (Photography) | Art and Design: Photography | Photography |
| Advanced Skills Challenge Cert | Advanced Skills Baccalaureate | Welsh Baccalaureate |

### Known Valid Subjects Whitelist

The following subjects are now automatically accepted as valid, regardless of API validation:
- Design and Technology
- Art and Design
- Photography
- Welsh Second Language
- Welsh Baccalaureate
- Computer Science
- Further Mathematics
- English Language and Literature
- Core Maths

## How It Works

1. **Prefix Stripping**: First removes course type prefixes (A -, WBQ -, etc.)
2. **Name Mapping**: Maps common variations to simplified forms
3. **Whitelist Check**: Known valid subjects skip API validation
4. **API Validation**: Only unknown subjects are sent to the API

## Debugging

The system now logs to the browser console:
```
SUBJECT MAPPING: "A - D&T (Product Design)" -> stripped to "D&T (Product Design)" -> mapped to "Design and Technology"
```

Open the browser console (F12) during validation to see what mappings are being applied.

## Testing

Try uploading your CSV again. These subjects should now validate:
- ✅ A - D&T (Product Design)
- ✅ A - Art (3D Design)  
- ✅ A - Art (Photography)
- ✅ A - Welsh 2nd Language
- ✅ WBQ - Advanced Skills Challenge Cert

## If Issues Persist

If certain subjects still fail validation:

1. **Check the browser console** for mapping details
2. **Try the simplified form directly** (e.g., "Design and Technology" instead of "D&T (Product Design)")
3. **Report the subject name** so it can be added to the whitelist

## Version
- Date: September 16, 2025
- File: index10b.js
- Status: Deployed
