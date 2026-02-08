-- SQL Schema Verification Script
-- Run this to check current table structures and find old columns

-- Check blood_requests table structure
PRINT '=== BLOOD_REQUESTS TABLE ==='
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'blood_requests'
ORDER BY ORDINAL_POSITION;
GO

-- Check request_hospitals table structure
PRINT '=== REQUEST_HOSPITALS TABLE (Junction Table) ==='
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'request_hospitals'
ORDER BY ORDINAL_POSITION;
GO

-- Check transfers table structure
PRINT '=== TRANSFERS TABLE ==='
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'transfers'
ORDER BY ORDINAL_POSITION;
GO

-- Check donations table structure
PRINT '=== DONATIONS TABLE ==='
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'donations'
ORDER BY ORDINAL_POSITION;
GO

-- Check for old columns that should be removed
PRINT '=== OLD COLUMNS TO REMOVE ==='

-- Check if blood_requests has old JSON column
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'blood_requests' 
    AND COLUMN_NAME = 'selected_hospitals'
)
BEGIN
    PRINT '⚠️  blood_requests.selected_hospitals (OLD JSON column - should be removed)'
END
ELSE
BEGIN
    PRINT '✓ blood_requests.selected_hospitals already removed'
END

-- Check if blood_requests has old hospital_id column
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'blood_requests' 
    AND COLUMN_NAME = 'hospital_id'
)
BEGIN
    PRINT '⚠️  blood_requests.hospital_id (OLD column - should be removed)'
END
ELSE
BEGIN
    PRINT '✓ blood_requests.hospital_id already removed'
END

-- Check if transfers has redundant blood data
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'transfers' 
    AND COLUMN_NAME IN ('blood_type', 'rh_factor', 'component_type', 'volume_ml')
)
BEGIN
    PRINT '⚠️  transfers table has redundant blood columns (denormalized - can be retrieved via blood_id)'
    PRINT '    Columns: blood_type, rh_factor, component_type, volume_ml'
    PRINT '    These can be removed for full 3NF compliance (blood_id is sufficient)'
END
ELSE
BEGIN
    PRINT '✓ transfers table is normalized (no redundant blood data)'
END

-- Check foreign key constraints
PRINT '=== FOREIGN KEY CONSTRAINTS ==='
SELECT 
    FK.name AS ForeignKeyName,
    OBJECT_NAME(FK.parent_object_id) AS TableName,
    COL_NAME(FKC.parent_object_id, FKC.parent_column_id) AS ColumnName,
    OBJECT_NAME(FK.referenced_object_id) AS ReferencedTableName,
    COL_NAME(FKC.referenced_object_id, FKC.referenced_column_id) AS ReferencedColumnName
FROM sys.foreign_keys AS FK
INNER JOIN sys.foreign_key_columns AS FKC
    ON FK.object_id = FKC.constraint_object_id
WHERE OBJECT_NAME(FK.parent_object_id) IN ('blood_requests', 'request_hospitals', 'transfers', 'donations')
ORDER BY TableName, ForeignKeyName;
GO

-- Check data integrity
PRINT '=== DATA INTEGRITY CHECK ==='

-- Count requests in each table
SELECT 
    'blood_requests' AS TableName,
    COUNT(*) AS RecordCount,
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS PendingCount,
    SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS ApprovedCount,
    SUM(CASE WHEN status = 'fulfilled' THEN 1 ELSE 0 END) AS FulfilledCount,
    SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS RejectedCount
FROM blood_requests
UNION ALL
SELECT 
    'request_hospitals' AS TableName,
    COUNT(*) AS RecordCount,
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS PendingCount,
    SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS ApprovedCount,
    SUM(CASE WHEN status = 'fulfilled' THEN 1 ELSE 0 END) AS FulfilledCount,
    SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS RejectedCount
FROM request_hospitals
UNION ALL
SELECT 
    'transfers' AS TableName,
    COUNT(*) AS RecordCount,
    NULL, NULL, NULL, NULL
FROM transfers;
GO

-- Check for orphaned records
PRINT '=== ORPHANED RECORDS CHECK ==='

-- request_hospitals without blood_requests
SELECT 
    'Orphaned request_hospitals records (no parent blood_requests)' AS Issue,
    COUNT(*) AS Count
FROM request_hospitals rh
LEFT JOIN blood_requests br ON rh.request_id = br.request_id
WHERE br.request_id IS NULL;
GO

-- transfers without blood_requests
SELECT 
    'Orphaned transfers records (no parent blood_requests)' AS Issue,
    COUNT(*) AS Count
FROM transfers t
LEFT JOIN blood_requests br ON t.request_id = br.request_id
WHERE br.request_id IS NULL;
GO

PRINT '=== VERIFICATION COMPLETE ==='
