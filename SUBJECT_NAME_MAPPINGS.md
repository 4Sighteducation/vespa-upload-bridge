# Subject Name Mappings for KS5 Validation

## Overview
The validation system now automatically maps common subject name variations to the standardized names expected by the API. This ensures your data validates correctly even when using common abbreviations or alternative formats.

## Subject Name Mappings

The following subject names are automatically mapped during validation:

### Mathematics
- **Input**: `Maths (Further)` or `Mathematics (Further)`
- **Mapped to**: `Further Mathematics`
- **Example**: `A - Maths (Further)` → validates as `Further Mathematics`

### English
- **Input**: `English Lang. & Lit.` or `English Language & Literature`
- **Mapped to**: `English Language and Literature`
- **Example**: `A - English Lang. & Lit.` → validates as `English Language and Literature`

### Design and Technology
- **Input**: `D&T (Product Design)`, `DT (Product Design)`, or `Design & Technology (Product Design)`
- **Mapped to**: `Design and Technology: Product Design`
- **Example**: `A - D&T (Product Design)` → validates as `Design and Technology: Product Design`

### Art Subjects
#### 3D Design
- **Input**: `Art (3D Design)` or `Art & Design (3D Design)`
- **Mapped to**: `Art and Design: 3D Design`
- **Example**: `A - Art (3D Design)` → validates as `Art and Design: 3D Design`

#### Photography
- **Input**: `Art (Photography)` or `Art & Design (Photography)`
- **Mapped to**: `Art and Design: Photography`
- **Example**: `A - Art (Photography)` → validates as `Art and Design: Photography`

### Welsh Language
- **Input**: `Welsh 2nd Language` or `Welsh Second Lang`
- **Mapped to**: `Welsh Second Language`
- **Example**: `A - Welsh 2nd Language` → validates as `Welsh Second Language`

### Welsh Baccalaureate
- **Input**: `Advanced Skills Challenge Cert` or `Advanced Skills Challenge Certificate`
- **Mapped to**: `Advanced Skills Baccalaureate`
- **Example**: `WBQ - Advanced Skills Challenge Cert` → validates as `Advanced Skills Baccalaureate`

### Computer Science
- **Input**: `Computing`
- **Mapped to**: `Computer Science`
- **Example**: `A - Computing` → validates as `Computer Science`

### Core Mathematics
- **Input**: `Core Mathematics` or `L3 - Core Mathematics`
- **Mapped to**: `Core Maths`
- **Example**: `L3 - Core Mathematics` → validates as `Core Maths`

## How It Works

1. **During Validation**:
   - The system strips any course type prefixes (A -, BT -, WBQ -, etc.)
   - Maps the subject name to its standardized form
   - Sends the standardized name to the validation API
   
2. **During Processing**:
   - The original subject names (with prefixes) are preserved
   - The system correctly identifies qualification types
   - MEG calculations use the appropriate benchmarks

3. **Error Messages**:
   - If a subject fails validation, the error shows your original input
   - Example: Error will show `"A - Art (Photography)"` not the mapped name

## Adding New Mappings

If you encounter a subject that should be valid but isn't recognized:

1. **Check the spelling** against the list above
2. **Try the mapped version** directly (e.g., use "Further Mathematics" instead of "Maths (Further)")
3. **Contact support** if a common variation needs to be added to the mappings

## Common Issues Resolved

These mappings resolve validation errors for:
- Schools using common abbreviations (D&T, Lang. & Lit.)
- Different formatting styles (parentheses vs colons)
- Welsh qualifications variations
- Computing vs Computer Science naming

## Version History

- **v1.1.0** (Sept 16, 2025): Added comprehensive subject name mappings
- **v1.0.0** (Sept 16, 2025): Initial prefix stripping implementation

## Related Documentation

- [Course Type Prefixes](COURSE_TYPE_PREFIXES.md) - List of supported qualification prefixes
- [Validation Fix Update](VALIDATION_FIX_UPDATE.md) - Technical details of the validation fix
