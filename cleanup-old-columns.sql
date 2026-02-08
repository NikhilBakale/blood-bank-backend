-- ============================================================================
-- CLEANUP OLD COLUMNS FROM 3NF MIGRATION
-- ============================================================================
-- ⚠️  ONLY RUN THIS AFTER:
-- 1. Running verify-schema.sql to confirm migration
-- 2. Verifying all data is in request_hospitals junction table
-- 3. Testing approval and transfer flows work correctly
-- 4. Creating a database backup
-- ============================================================================

-- Step 1: Verify the old columns exist
PRINT '=== Checking for old columns to remove ==='
GO

-- Check for selected_hospitals JSON column
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'blood_requests' 
    AND COLUMN_NAME = 'selected_hospitals'
)
BEGIN
    PRINT '✓ Found: blood_requests.selected_hospitals'
    PRINT '  (Column exists and will be removed)'
END
ELSE
BEGIN
    PRINT '✗ blood_requests.selected_hospitals not found (already removed or never existed)'
END
GO

-- Check for old hospital_id column
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'blood_requests' 
    AND COLUMN_NAME = 'hospital_id'
)
BEGIN
    PRINT '✓ Found: blood_requests.hospital_id'
    PRINT '  (Column exists and will be removed)'
END
ELSE
BEGIN
    PRINT '✗ blood_requests.hospital_id not found (already removed or never existed)'
END
GO

-- Step 2: Verify all data is migrated to junction table
PRINT ''
PRINT '=== Verifying data migration ==='
GO

-- Count requests with old data vs new data
SELECT 
    COUNT(*) AS total_requests,
    SUM(CASE WHEN EXISTS (
        SELECT 1 FROM request_hospitals rh 
        WHERE rh.request_id = br.request_id
    ) THEN 1 ELSE 0 END) AS requests_in_junction_table
FROM blood_requests br;
GO

-- Show any requests NOT in junction table
PRINT ''
PRINT 'Requests not in junction table (if any):'
SELECT 
    br.request_id,
    br.patient_name,
    br.blood_type,
    br.status,
    br.created_at
FROM blood_requests br
WHERE NOT EXISTS (
    SELECT 1 FROM request_hospitals rh 
    WHERE rh.request_id = br.request_id
)
ORDER BY br.created_at DESC;
GO

-- Step 3: Remove old columns (COMMENTED OUT FOR SAFETY)
PRINT ''
PRINT '=== Ready to remove old columns ==='
PRINT 'The following commands will drop old columns.'
PRINT 'Uncomment and run only after verifying data above.'
PRINT ''
GO

-- ⚠️  UNCOMMENT THESE LINES AFTER VERIFICATION:

/*
-- Drop selected_hospitals JSON column
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'blood_requests' 
    AND COLUMN_NAME = 'selected_hospitals'
)
BEGIN
    PRINT 'Dropping blood_requests.selected_hospitals...'
    ALTER TABLE blood_requests DROP COLUMN selected_hospitals;
    PRINT '✓ Dropped successfully'
END
GO

-- Drop old hospital_id foreign key column
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'blood_requests' 
    AND COLUMN_NAME = 'hospital_id'
)
BEGIN
    -- First drop any foreign key constraints
    DECLARE @ConstraintName NVARCHAR(200)
    SELECT @ConstraintName = name
    FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID('blood_requests')
    AND COL_NAME(parent_object_id, parent_column_id) = 'hospital_id'
    
    IF @ConstraintName IS NOT NULL
    BEGIN
        PRINT 'Dropping FK constraint: ' + @ConstraintName
        EXEC('ALTER TABLE blood_requests DROP CONSTRAINT ' + @ConstraintName)
    END
    
    PRINT 'Dropping blood_requests.hospital_id...'
    ALTER TABLE blood_requests DROP COLUMN hospital_id;
    PRINT '✓ Dropped successfully'
END
GO
*/

-- Step 4: Final verification
PRINT ''
PRINT '=== Final Schema Check ==='
PRINT 'blood_requests table columns (after cleanup):'
GO

SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'blood_requests'
ORDER BY ORDINAL_POSITION;
GO

PRINT ''
PRINT '=== CLEANUP SCRIPT COMPLETE ==='
PRINT ''
PRINT 'If old columns still exist:'
PRINT '1. Review the verification data above'
PRINT '2. Ensure all data is migrated to request_hospitals'
PRINT '3. Create a database backup'
PRINT '4. Uncomment the DROP COLUMN commands in this script'
PRINT '5. Re-run this script'
GO
