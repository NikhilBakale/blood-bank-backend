# 3NF Database Normalization Guide

## Overview
This guide explains how to migrate your Blood Inventory Management database to Third Normal Form (3NF) while maintaining full backward compatibility.

## Changes Made

### 1. TRANSFERS Table (Critical Fix)
**Problem:** Stored redundant blood information that's already in donations table
- Removed: `blood_type`, `rh_factor`, `component_type`, `volume_ml`, `donor_id`
- Impact: Eliminates data inconsistency risk

**Before (NOT 3NF):**
```sql
transfers: transfer_id → blood_id, blood_type, rh_factor, component_type, volume_ml, donor_id, ...
```

**After (3NF Compliant):**
```sql
transfers: transfer_id → blood_id, request_id, hospital_id, recipient_name, ...
-- Get blood details via JOIN with donations table
```

### 2. HOSPITALS & DONORS Tables (Medium Priority)
**Problem:** postal_code determines city and state (transitive dependency)
- Created: `postal_codes` lookup table
- Removed: `city`, `state` columns from hospitals and donors
- Impact: Better data integrity

**New Structure:**
```sql
postal_codes: postal_code → city, state, country
hospitals: hospital_id → name, address, postal_code (FK), ...
donors: donor_id → name, address, postal_code (FK), ...
```

## Migration Files

### SQL Migration Scripts
1. **`normalize_transfers_to_3nf.sql`**
   - Creates `transfers_normalized` table (no redundant columns)
   - Creates `transfers_view` for backward compatibility
   - Migrates all existing data

2. **`create_postal_codes_table.sql`**
   - Creates `postal_codes` table
   - Extracts postal codes from existing data
   - Creates `hospitals_normalized` and `donors_normalized`
   - Creates views for backward compatibility

### PowerShell Scripts
1. **`deploy-3nf-normalization.ps1`**
   - Deploys both migrations
   - Creates backups automatically
   - Interactive deployment with confirmations

2. **`test-3nf-migration.ps1`**
   - Tests all normalized tables
   - Verifies data consistency
   - Checks view functionality

## Deployment Steps

### Prerequisites
```powershell
# Set environment variables
$env:SQL_SERVER = "your-server.database.windows.net"
$env:SQL_DATABASE = "your-database-name"
```

### Step 1: Deploy Migrations
```powershell
# Run deployment script
cd blood-bank-buddy\server
.\deploy-3nf-normalization.ps1

# Answer 'yes' to both prompts to deploy changes
```

This creates:
- ✅ Backup tables (transfers_backup_20251228, etc.)
- ✅ Normalized tables (transfers_normalized, hospitals_normalized, donors_normalized)
- ✅ Lookup table (postal_codes)
- ✅ Backward compatibility views (transfers_view, hospitals_view, donors_view)

### Step 2: Test the Migration
```powershell
# Run test script
.\test-3nf-migration.ps1
```

Verify:
- ✅ All tables exist
- ✅ Row counts match
- ✅ Views return correct data
- ✅ JOINs work properly
- ✅ No data inconsistencies

### Step 3: Test Your Application
The application code has been updated to use the new structure:
- **INSERT operations**: Only insert non-redundant data
- **SELECT operations**: Use JOINs to get blood details

Test these endpoints:
```javascript
// Create transfer (uses normalized structure)
POST /api/hospital/transfers
{
  "blood_id": "BLOOD123",
  "request_id": "uuid",
  "hospital_id": "H001",
  "recipient_name": "John Doe"
}

// Get transfers (returns complete data via JOIN)
GET /api/hospital/transfers?hospital_id=H001
// Returns: transfer_id, blood_id, blood_type, donor_id, etc.
```

### Step 4: Activate Changes (Final Step)

⚠️ **IMPORTANT:** Only do this after thorough testing!

1. Open `normalize_transfers_to_3nf.sql`
2. Uncomment Step 5 (lines starting with `/*` and ending with `*/`)
3. Run the script again to rename tables

2. Open `create_postal_codes_table.sql`
3. Uncomment Step 6
4. Run the script again

This will:
- Rename `transfers` → `transfers_old`
- Rename `transfers_normalized` → `transfers`
- Same for hospitals and donors tables

## Backward Compatibility

### Views Provide Seamless Transition
The views make the migration transparent:

```sql
-- Old query (still works with views)
SELECT * FROM transfers_view;
-- Returns all columns including blood_type, donor_id, etc.

-- Old query (still works)
SELECT city, state FROM hospitals_view;
-- Returns city and state via JOIN with postal_codes
```

### Application Code Updates
The server.js has been updated to:
1. **INSERT**: Only store non-redundant data
2. **SELECT**: Use JOINs to retrieve complete information

**Example:**
```javascript
// Old INSERT (redundant data)
INSERT INTO transfers (blood_id, blood_type, rh_factor, ...)

// New INSERT (3NF compliant)
INSERT INTO transfers (blood_id, request_id, hospital_id, ...)

// SELECT (automatically JOINs with donations)
SELECT t.*, d.blood_type, d.rh_factor FROM transfers t
LEFT JOIN donations d ON t.blood_id = d.blood_id
```

## Rollback Plan

If you need to rollback:

```sql
-- Rollback transfers
DROP TABLE transfers;
EXEC sp_rename 'transfers_old', 'transfers';

-- Rollback hospitals
DROP TABLE hospitals;
EXEC sp_rename 'hospitals_old', 'hospitals';

-- Rollback donors
DROP TABLE donors;
EXEC sp_rename 'donors_old', 'donors';

-- Or restore from backups
DROP TABLE transfers;
SELECT * INTO transfers FROM transfers_backup_20251228;
```

## Benefits of 3NF

### Data Integrity
- ✅ Single source of truth (no redundant blood data)
- ✅ Update anomalies eliminated
- ✅ Insert anomalies eliminated
- ✅ Delete anomalies eliminated

### Consistency
```sql
-- Before: Data could be inconsistent
transfers: blood_id=123, blood_type='A+'
donations: blood_id=123, blood_type='O+'  -- CONFLICT!

-- After: Always consistent
transfers: blood_id=123
donations: blood_id=123, blood_type='O+'  -- Single source
```

### Storage Efficiency
- Reduces data redundancy
- Smaller table sizes
- Less storage required

## Performance Considerations

### Potential Impact
- **Reads**: Slight increase (requires JOIN)
- **Writes**: Faster (less data to insert)
- **Storage**: Reduced (no redundancy)

### Mitigation
1. **Indexes**: Already created on JOIN columns
   - `IX_transfers_blood_id`
   - `IX_hospitals_postal_code`
   - `IX_donors_postal_code`

2. **Views**: Provide denormalized data when needed
   - Use views for read-heavy operations
   - Use normalized tables for writes

3. **Caching**: Consider caching frequently accessed data

## Monitoring

After deployment, monitor:
1. Query performance (check execution times)
2. Application logs (check for errors)
3. Data integrity (run test script regularly)

## Support

If you encounter issues:
1. Check logs: `logs/transfers_migration.log`
2. Run test script: `.\test-3nf-migration.ps1`
3. Review views: Ensure they return expected data
4. Rollback if necessary (see Rollback Plan)

## Summary

| Table | Before | After | Impact |
|-------|--------|-------|--------|
| TRANSFERS | ❌ Not 3NF | ✅ 3NF Compliant | High - eliminated inconsistency risk |
| HOSPITALS | ❌ Not 3NF | ✅ 3NF Compliant | Medium - better data integrity |
| DONORS | ❌ Not 3NF | ✅ 3NF Compliant | Medium - better data integrity |
| REQUEST_HOSPITALS | ⚠️ Intentional denormalization | ⚠️ Keep as is | Low - performance trade-off |

Your database is now **3NF compliant** while maintaining full backward compatibility! 🎉
