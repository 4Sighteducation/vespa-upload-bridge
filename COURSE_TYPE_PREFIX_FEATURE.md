# Course Type Prefix Recognition Feature

## Feature Overview
Implemented automatic recognition of qualification type prefixes in student KS5 subject data uploads, allowing schools to clearly identify different types of qualifications using standardized prefixes.

## Release Date
September 16, 2025

## Changes Made

### Backend (vespa-upload-api)
**Modified Files:**
- `worker.js` - Added course type prefix recognition logic in `studentKs5SubjectsProcessor`

**New Files:**
- `COURSE_TYPE_PREFIXES.md` - Comprehensive documentation of supported prefixes

**Key Changes:**
1. Added automatic detection of course type prefixes (e.g., "A - ", "BT - ", "CN - ")
2. Enhanced qualification type detection with prefix-based identification
3. Improved logging to track detected course types
4. Added proper formatting for different qualification types in display

### Frontend (vespa-upload-bridge)
**Modified Files:**
- `src/index6o.css` - Added visual styles for qualification type badges

**Key Changes:**
1. Added color-coded badge styles for each qualification type
2. Created tooltip styles for additional information
3. Added responsive styles for qualification indicators

## Supported Course Type Prefixes

### Core Prefixes (As Requested)
- `A - ` → A Level
- `BT - ` → BTEC
- `CN - ` → Cambridge National

### Additional UK Qualifications
- `AS - ` → AS Level
- `WBQ - ` → Welsh Baccalaureate
- `EPQ - ` → Extended Project
- `IB - ` → International Baccalaureate
- `T - ` → T Level
- `C - ` → City & Guilds
- `D - ` → Diploma
- `CT - ` → Certificate
- `AP - ` → Applied
- `NV - ` → NVQ
- `GN - ` → GNVQ
- `CM - ` → Cambridge International
- `OCR - ` → OCR
- `L3 - ` → Level 3
- `L2 - ` → Level 2

## How Schools Use This Feature

1. **In CSV Files**: Schools can prefix their subject names with the appropriate code:
   ```csv
   UPN,Student_Email,GCSE_Prior_Attainment,sub1,sub2,sub3,sub4,sub5
   123456,student@school.uk,7.5,A - Biology,A - Chemistry,BT - Business,EPQ - Extended Project,
   ```

2. **Automatic Processing**: The system automatically:
   - Detects the prefix
   - Identifies the qualification type
   - Extracts the clean subject name
   - Applies appropriate MEG calculations

3. **Visual Feedback**: The UI displays color-coded badges for easy identification

## Benefits

1. **Clarity**: Clear identification of qualification types in uploads
2. **Accuracy**: Ensures correct MEG calculations based on qualification type
3. **Flexibility**: Optional feature - schools can use it or rely on auto-detection
4. **Consistency**: Standardizes qualification identification across all schools
5. **Better Reporting**: Enables qualification-type specific analysis

## Technical Implementation

### Backend Logic Flow
1. Parse raw subject name from CSV
2. Check for known prefixes using mapping table
3. If prefix found:
   - Extract qualification type
   - Remove prefix to get clean subject name
   - Log the detection
4. Apply appropriate calculation logic based on qualification type
5. Store both original name and qualification type

### Frontend Display
- Color-coded badges using CSS classes
- Each qualification type has unique color scheme
- Tooltips provide additional context
- Responsive design for mobile/tablet views

## Backward Compatibility
- Fully backward compatible with existing data
- Schools not using prefixes continue to work with auto-detection
- No changes required for existing uploads

## Testing Recommendations

1. **Test with prefixed data**: Upload CSV with various prefix types
2. **Test without prefixes**: Ensure auto-detection still works
3. **Test mixed format**: Some subjects with prefixes, some without
4. **Verify calculations**: Ensure correct MEG calculations for each type
5. **Check visual display**: Confirm badges appear correctly

## Future Enhancements

Potential improvements for future releases:
1. Admin interface to customize prefix mappings
2. Export functionality showing qualification type breakdown
3. Analytics dashboard for qualification type distribution
4. Bulk editing of qualification types post-upload
5. Support for international qualification systems

## Support

For questions or issues with this feature:
1. Check the `COURSE_TYPE_PREFIXES.md` documentation
2. Review example CSV templates
3. Contact technical support with specific upload examples

## Version History

- **v1.0.0** (Sept 16, 2025): Initial implementation with 18 qualification types supported
