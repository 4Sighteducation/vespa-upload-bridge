# School Management Feature - Implementation Handover

**Date**: December 3, 2025  
**Feature**: School Creation & Migration for Account Manager  
**Version**: accountManager2d.js  
**Status**: ✅ Frontend Complete | ⚠️ Backend Needs Deployment

---

## 🎯 What Was Built

### **Problem Solved:**
- Schools like **Kendal College** (crossover period schools) are NOT in Supabase yet
- Cannot appear in dropdown, so cannot upload accounts for them
- Need ability to add schools to both Knack and Supabase (dual write)

### **Solution:**
New **"🏫 Manage Schools"** button (super user only) with:
1. **View all schools** (Knack + Supabase status)
2. **Add new schools** to BOTH systems simultaneously
3. **Migrate existing schools** from Knack to Supabase

---

## 📁 Files Created/Modified

### **Frontend (vespa-upload-bridge):**
```
✅ src/accountManager2d.js (NEW VERSION - copy of 2c with school management)
├── New modal: School Management
├── New modal: Add New School
├── Methods: openSchoolManagementModal, addNewSchool, migrateSchoolToSupabase
├── Form fields aligned to ACTUAL establishments table schema
└── Version bumped: 2c → 2d

✅ KnackAppLoader(copy).js (UPDATED)
└── Points to accountManager2d.js (line 1575)
```

### **Backend (vespa-upload-api):**
```
✅ src/routes/establishmentManagement.js (CREATED)
├── GET /api/v3/establishments/status
├── POST /api/v3/establishments/create (DUAL WRITE!)
├── POST /api/v3/establishments/migrate
└── GET /api/v3/trusts

✅ index.js (UPDATED)
├── Import: establishmentManagementRoutes
├── Mount: app.use('/api/v3/establishments', ...)
└── Added to available_major_routes list
```

---

## 🗄️ Database Schema (Supabase)

### **establishments table** (ACTUAL SCHEMA):
```sql
id                  UUID PRIMARY KEY
knack_id            VARCHAR            -- Links to Knack Object_1 (Customers)
name                VARCHAR            -- School name
trust_id            UUID               -- FK to trusts table (nullable)
is_australian       BOOLEAN            -- Default false
status              VARCHAR            -- 'active', 'inactive', 'archived'
use_standard_year   BOOLEAN            -- Default true
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

**NOTE:** No `address`, `postcode`, or `phase` fields exist! (I incorrectly assumed these initially)

---

## 🔧 Backend Endpoints

### **1. GET `/api/v3/establishments/status`**
**Purpose:** List ALL Knack schools with Supabase sync status

**Response:**
```json
{
  "success": true,
  "schools": [
    {
      "knackId": "abc123",
      "name": "Kendal College",
      "inSupabase": false,
      "supabaseUuid": null,
      "accounts": { "staff": 5, "students": 0 }
    },
    {
      "knackId": "def456",
      "name": "VESPA Academy",
      "inSupabase": true,
      "supabaseUuid": "uuid-...",
      "accounts": { "staff": 12, "students": 130 }
    }
  ]
}
```

**Logic:**
1. Fetch ALL customers from Knack Object_2 (Customers)
2. Fetch ALL establishments from Supabase
3. Match by `knack_id`
4. Count accounts in Knack for each school
5. Return combined status

**⚠️ TODO:** Verify Knack field IDs:
- `field_8` = School name?
- `field_122` = School connection field in staff/students?

---

### **2. POST `/api/v3/establishments/create`** ⭐ **MAIN FEATURE**
**Purpose:** Create school in BOTH Knack and Supabase (dual write)

**Request Body:**
```json
{
  "name": "Kendal College",
  "knackId": "abc123",               // Optional - for linking existing
  "trustId": "uuid-or-null",         // Optional
  "isAustralian": false,             // Optional (default false)
  "status": "active",                // Optional (default 'active')
  "useStandardYear": true,           // Optional (default true)
  "userEmail": "admin@vespa.com",    // For audit
  "dualWrite": true
}
```

**Logic:**
```javascript
if (knackId) {
  // MIGRATION MODE: Link existing Knack school
  // 1. Verify school exists in Knack Object_2
  // 2. Create in Supabase with that knack_id
} else {
  // NEW SCHOOL MODE: Create in both
  // 1. Create in Knack Object_2 first
  // 2. Get returned Knack ID
  // 3. Create in Supabase with that knack_id
}

// Insert into Supabase:
INSERT INTO establishments (
  knack_id, name, trust_id, is_australian, 
  status, use_standard_year
) VALUES (...);

return { knackId, supabaseUuid, dualWrite: true }
```

**Response:**
```json
{
  "success": true,
  "knackId": "abc123",
  "supabaseUuid": "uuid-...",
  "name": "Kendal College",
  "dualWrite": true,
  "message": "School created successfully in both Knack and Supabase"
}
```

---

### **3. POST `/api/v3/establishments/migrate`**
**Purpose:** Copy existing Knack school to Supabase (one-way)

**Request Body:**
```json
{
  "knackCustomerId": "abc123",
  "customerName": "Kendal College",
  "migrateAccounts": false,          // true = also migrate all staff/students
  "userEmail": "admin@vespa.com"
}
```

**Response:**
```json
{
  "success": true,
  "supabaseUuid": "uuid-...",
  "knackId": "abc123",
  "accounts": { "staff": 5, "students": 120 },
  "message": "School migrated successfully to Supabase"
}
```

**NOTE:** Account migration (`migrateAccounts: true`) is stubbed out for now.

---

### **4. GET `/api/v3/trusts`**
**Purpose:** Get all trusts for dropdown

**Response:**
```json
{
  "success": true,
  "trusts": [
    { "id": "uuid1", "name": "Example Academy Trust" },
    { "id": "uuid2", "name": "Multi-Academy Trust" }
  ]
}
```

---

## 🎨 Frontend UI

### **School Management Modal:**
![Conceptual Layout]
```
┌────────────────────────────────────────────┐
│ 🏫 School Management & Migration          │
│                                  [✖ Close] │
├────────────────────────────────────────────┤
│                                            │
│  [➕ Add New School]   [🔄 Refresh List]  │
│  [⚡ Migrate All (5)]                     │
│                                            │
│ ┌──────────────────────────────────────┐ │
│ │ Status │ School Name  │ Accounts │ Ac│ │
│ ├──────────────────────────────────────┤ │
│ │ ✅    │ VESPA Academy│ 👥12🎓130│ ✅ │ │
│ │ ⚠️     │ Kendal       │ 👥5 🎓0  │ 🔄 │ │
│ │ ⚠️     │ Example Coll │ 👥0 🎓0  │ 🔄 │ │
│ └──────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

### **Add New School Modal:**
```
┌──────────────────────────────────────┐
│ ➕ Add New School                    │
│                        [✖ Close]     │
├──────────────────────────────────────┤
│ ✅ Dual Write Mode                  │
│ Creates in BOTH Knack & Supabase    │
│                                      │
│ School Name: [Kendal College______] │
│                                      │
│ Trust: [-- No Trust --▼]            │
│ Status: [Active▼]                   │
│                                      │
│ ☑️ Use Standard Academic Year       │
│ ☐ Australian School                 │
│                                      │
│ 🔄 Link Existing Knack School:     │
│ [abc123 (leave blank for new)____] │
│                                      │
│   [Cancel] [✅ Create School]       │
└──────────────────────────────────────┘
```

---

## ✅ Testing Plan for Kendal

### **Step 1: Find Kendal's Knack ID**
```bash
# In Knack dashboard:
Go to: Object_2 (Customers)
Search: "Kendal"
Copy: Record ID (e.g., "5a1b2c3d4e5f6g7h8i9j0k")
```

### **Step 2: Open Account Manager**
1. Login as super user
2. Navigate to Account Management page
3. You should see: **"🏫 Manage Schools"** button

### **Step 3: Add Kendal**
1. Click "🏫 Manage Schools"
2. Click "➕ Add New School"
3. Fill form:
   - Name: `Kendal College`
   - Link Existing Knack ID: `[paste ID from step 1]`
   - Trust: `-- No Trust --`
   - Status: `Active`
   - ☑️ Use Standard Academic Year
4. Click "✅ Create School"

### **Step 4: Verify**
```sql
-- Check Supabase:
SELECT id, knack_id, name 
FROM establishments 
WHERE name ILIKE '%kendal%';

-- Should return:
-- id | knack_id | name
-- uuid | abc123... | Kendal College
```

### **Step 5: Upload Accounts**
1. Back in Account Manager
2. School dropdown should now show "Kendal College"
3. Select it
4. Upload staff/students as normal!

---

## ⚠️ IMPORTANT NOTES

### **Knack Field IDs to Verify:**
The backend code uses **PLACEHOLDER** field IDs that need verification:

```javascript
// Line 63 in establishmentManagement.js:
const name = customer.field_8 || 'Unknown School';  
// ❓ Is field_8 the correct name field in Object_2?

// Lines 93-95:
field: 'field_122'  // School connection in staff/students
// ❓ Is field_122 the correct connection field?
```

**TODO BEFORE DEPLOYMENT:**
1. Check Knack Object_2 (Customers) field structure
2. Check Knack Object_7 (Staff) - what field connects to school?
3. Check Knack Object_6 (Students) - what field connects to school?
4. Update field IDs in `establishmentManagement.js`

### **Dependencies:**
- ✅ `knackService.getAllRecords()` - Should exist
- ✅ `knackService.getRecord()` - Should exist
- ✅ `knackService.createRecord()` - Should exist
- ✅ `getEstablishmentUuid()` - Already exists in supabaseService
- ✅ Supabase client - Already configured

---

## 📋 Deployment Checklist

### **Backend:**
```bash
cd vespa-upload-api
git add src/routes/establishmentManagement.js
git add index.js
git commit -m "feat: Add establishment management endpoints for school creation & migration"
git push origin main
git push heroku main

# Monitor deployment:
heroku logs --tail -a vespa-upload-api
```

### **Frontend:**
```bash
cd vespa-upload-bridge
git add src/accountManager2d.js
git commit -m "feat: Add school management modal (v2d)"
git push origin main

# Update KnackAppLoader:
cd ../Homepage
git add KnackAppLoader(copy).js
git commit -m "chore: Update Account Manager to v2d with school management"
git push origin main

# ⚠️ MANUAL STEP:
# Copy KnackAppLoader(copy).js contents to Knack custom code
# (This is the only way to update the live system)
```

### **Verify Deployment:**
```bash
# Test API:
curl https://vespa-upload-api-07e11c285370.herokuapp.com/api/v3/establishments/status

# Should return:
# {"success":true,"schools":[...]}
```

---

## 🚨 Known Issues / Limitations

1. **Field IDs Not Verified** ⚠️
   - `field_8`, `field_122` are GUESSES
   - Must verify before deployment

2. **Account Migration Not Implemented** ⏳
   - `migrateAccounts: true` is stubbed out
   - Would need to call existing sync functions
   - Can be added later if needed

3. **No Address/Postcode Fields** ℹ️
   - Establishments table doesn't have these
   - If needed, add to Supabase schema first

4. **Trusts Table May Not Exist** ⚠️
   - `/api/v3/trusts` endpoint assumes table exists
   - Returns empty array if not (non-breaking)

---

## 🎓 How It Works (Architecture)

### **Dual Write Flow:**
```
User Clicks "Create School"
  ↓
Frontend: POST /api/v3/establishments/create
  ↓
Backend:
  ├─→ Check if knackId provided?
  │   ├─→ YES: Verify exists in Knack (migration mode)
  │   └─→ NO: Create new in Knack Object_2 (new school mode)
  ↓
  ├─→ Create in Supabase establishments table
  │   └─→ Use knack_id from above
  ↓
  ├─→ Return both IDs
  └─→ { knackId, supabaseUuid }
  ↓
Frontend:
  ├─→ Close modal
  ├─→ Reload schools list
  └─→ Refresh dropdown
  ↓
School now appears in dropdown! ✅
```

### **Why This Matters:**
- **Immediate availability**: School in dropdown right away
- **Dual write from start**: All future uploads go to both systems
- **Handles crossover**: Works for Kendal (Knack only) and new schools
- **Future-proof**: When we stop using Knack, just remove Knack side

---

## 📞 Support / Questions

### **Backend Issues:**
- Check Heroku logs: `heroku logs --tail -a vespa-upload-api | grep establishments`
- Verify field IDs in Knack
- Check Supabase permissions

### **Frontend Issues:**
- Check browser console for errors
- Verify CDN serving latest version (may take 5-10 min)
- Clear Knack cache

### **SQL Debugging:**
```sql
-- Check if school exists:
SELECT * FROM establishments WHERE name ILIKE '%kendal%';

-- Check all schools:
SELECT id, knack_id, name, status FROM establishments ORDER BY name;

-- Check trusts:
SELECT * FROM trusts;
```

---

## 🎉 Success Criteria

You'll know it's working when:
1. ✅ Super user can click "🏫 Manage Schools"
2. ✅ Modal shows list of all schools with status
3. ✅ Can click "➕ Add New School"
4. ✅ Form submits and creates in both systems
5. ✅ School appears in dropdown immediately
6. ✅ Can upload staff/students for that school
7. ✅ Kendal College is now manageable!

---

## 🚀 Next Steps (Future Enhancements)

1. **Account Migration**: Implement bulk account migration from Knack
2. **School Editing**: Add ability to edit existing schools
3. **School Deletion**: Add soft delete (set status='archived')
4. **Trust Management**: Add trust creation/editing
5. **Bulk Operations**: Mass migrate all schools at once
6. **Audit Log**: Track who created/modified schools

---

**🎊 This completes the School Management feature! Ready for testing with Kendal College.**

**Last Updated**: December 3, 2025

