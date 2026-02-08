-- ============================================================================
-- CHECK FOR BACKUP AND OLD TABLES
-- ============================================================================
-- This script identifies backup tables and old tables that can be removed
-- ============================================================================

PRINT '=== CHECKING FOR BACKUP AND OLD TABLES ==='
PRINT ''
GO

-- List all tables in the database
PRINT '=== ALL TABLES IN DATABASE ==='
SELECT 
    TABLE_SCHEMA,
    TABLE_NAME,
    TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;
GO

PRINT ''
PRINT '=== BACKUP TABLES (containing _backup, _old, _normalized, _copy, _temp) ==='
GO

SELECT 
    TABLE_NAME,
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = t.TABLE_NAME) AS column_count
FROM INFORMATION_SCHEMA.TABLES t
WHERE TABLE_TYPE = 'BASE TABLE'
  AND (
    TABLE_NAME LIKE '%_backup%' OR
    TABLE_NAME LIKE '%_old%' OR
    TABLE_NAME LIKE '%_normalized%' OR
    TABLE_NAME LIKE '%_copy%' OR
    TABLE_NAME LIKE '%_temp%' OR
    TABLE_NAME LIKE 'backup_%' OR
    TABLE_NAME LIKE 'old_%' OR
    TABLE_NAME LIKE 'temp_%'
  )
ORDER BY TABLE_NAME;
GO

-- Check for specific known backup patterns
PRINT ''
PRINT '=== CHECKING SPECIFIC BACKUP PATTERNS ==='
GO

-- Check for donations_backup
IF OBJECT_ID('donations_backup', 'U') IS NOT NULL
BEGIN
    PRINT '⚠️  donations_backup exists'
    SELECT COUNT(*) AS row_count FROM donations_backup;
END
ELSE
BEGIN
    PRINT '✓ donations_backup not found'
END
GO

-- Check for transfers_normalized
IF OBJECT_ID('transfers_normalized', 'U') IS NOT NULL
BEGIN
    PRINT '⚠️  transfers_normalized exists'
    SELECT COUNT(*) AS row_count FROM transfers_normalized;
END
ELSE
BEGIN
    PRINT '✓ transfers_normalized not found'
END
GO

-- Check for hospitals_normalized
IF OBJECT_ID('hospitals_normalized', 'U') IS NOT NULL
BEGIN
    PRINT '⚠️  hospitals_normalized exists'
    SELECT COUNT(*) AS row_count FROM hospitals_normalized;
END
ELSE
BEGIN
    PRINT '✓ hospitals_normalized not found'
END
GO

-- Check for donors_normalized
IF OBJECT_ID('donors_normalized', 'U') IS NOT NULL
BEGIN
    PRINT '⚠️  donors_normalized exists'
    SELECT COUNT(*) AS row_count FROM donors_normalized;
END
ELSE
BEGIN
    PRINT '✓ donors_normalized not found'
END
GO

-- Check for postal_codes (might be orphaned)
IF OBJECT_ID('postal_codes', 'U') IS NOT NULL
BEGIN
    PRINT '⚠️  postal_codes exists'
    SELECT COUNT(*) AS row_count FROM postal_codes;
END
ELSE
BEGIN
    PRINT '✓ postal_codes not found'
END
GO

PRINT ''
PRINT '=== REQUIRED PRODUCTION TABLES ==='
PRINT 'These tables should exist and be in use:'
GO

SELECT 
    TABLE_NAME,
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = t.TABLE_NAME) AS column_count,
    CASE 
        WHEN TABLE_NAME = 'hospitals' THEN '✓ Required for hospital management'
        WHEN TABLE_NAME = 'donors' THEN '✓ Required for donor records'
        WHEN TABLE_NAME = 'donations' THEN '✓ Required for blood inventory'
        WHEN TABLE_NAME = 'transfers' THEN '✓ Required for transfer history'
        WHEN TABLE_NAME = 'blood_requests' THEN '✓ Required for blood requests'
        WHEN TABLE_NAME = 'request_hospitals' THEN '✓ Required for request-hospital junction'
        WHEN TABLE_NAME = 'requesters' THEN '✓ Required for requester accounts'
        ELSE 'Unknown purpose'
    END AS purpose
FROM INFORMATION_SCHEMA.TABLES t
WHERE TABLE_TYPE = 'BASE TABLE'
  AND TABLE_NAME IN (
    'hospitals',
    'donors', 
    'donations',
    'transfers',
    'blood_requests',
    'request_hospitals',
    'requesters'
  )
ORDER BY TABLE_NAME;
GO

PRINT ''
PRINT '=== FOREIGN KEY DEPENDENCIES ==='
PRINT 'Showing which tables depend on others:'
GO

SELECT 
    OBJECT_NAME(f.parent_object_id) AS DependentTable,
    COL_NAME(fc.parent_object_id, fc.parent_column_id) AS DependentColumn,
    OBJECT_NAME(f.referenced_object_id) AS ReferencedTable,
    COL_NAME(fc.referenced_object_id, fc.referenced_column_id) AS ReferencedColumn,
    f.name AS ConstraintName
FROM sys.foreign_keys AS f
INNER JOIN sys.foreign_key_columns AS fc ON f.object_id = fc.constraint_object_id
ORDER BY DependentTable, ReferencedTable;
GO

PRINT ''
PRINT '=== RECOMMENDATION ==='
PRINT ''
PRINT 'Safe to remove (if they exist):'
PRINT '  - Tables ending in _backup, _old, _normalized, _copy, _temp'
PRINT '  - donations_backup'
PRINT '  - transfers_normalized' 
PRINT '  - hospitals_normalized'
PRINT '  - donors_normalized'
PRINT '  - postal_codes (if not referenced by foreign keys)'
PRINT ''
PRINT 'DO NOT REMOVE:'
PRINT '  - hospitals, donors, donations, transfers'
PRINT '  - blood_requests, request_hospitals, requesters'
PRINT ''
GO

-- Generate DROP statements for backup tables (commented for safety)
PRINT '=== GENERATED DROP STATEMENTS (REVIEW BEFORE UNCOMMENTING) ==='
GO

DECLARE @sql NVARCHAR(MAX) = ''
DECLARE @tableName NVARCHAR(128)

DECLARE backup_cursor CURSOR FOR
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
  AND (
    TABLE_NAME LIKE '%_backup%' OR
    TABLE_NAME LIKE '%_old%' OR
    TABLE_NAME LIKE '%_normalized%' OR
    TABLE_NAME LIKE '%_copy%' OR
    TABLE_NAME LIKE '%_temp%' OR
    TABLE_NAME LIKE 'backup_%' OR
    TABLE_NAME LIKE 'old_%' OR
    TABLE_NAME LIKE 'temp_%'
  )
  AND TABLE_NAME NOT IN ('hospitals', 'donors', 'donations', 'transfers', 'blood_requests', 'request_hospitals', 'requesters')
ORDER BY TABLE_NAME

OPEN backup_cursor
FETCH NEXT FROM backup_cursor INTO @tableName

WHILE @@FETCH_STATUS = 0
BEGIN
    PRINT '-- DROP TABLE ' + @tableName + ';'
    FETCH NEXT FROM backup_cursor INTO @tableName
END

CLOSE backup_cursor
DEALLOCATE backup_cursor
GO

PRINT ''
PRINT '=== CHECK COMPLETE ==='
GO
