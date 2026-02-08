-- ============================================================================
-- REMOVE BACKUP TABLES - SAFE CLEANUP
-- ============================================================================
-- ⚠️  ONLY RUN THIS AFTER:
-- 1. Running check-backup-tables.sql to see what exists
-- 2. Creating a database backup
-- 3. Verifying these are truly backup/old tables not in use
-- ============================================================================

PRINT '=== REMOVING BACKUP AND OLD TABLES ==='
PRINT ''
GO

-- Drop donations_backup if exists
IF OBJECT_ID('donations_backup', 'U') IS NOT NULL
BEGIN
    PRINT 'Dropping donations_backup...'
    DROP TABLE donations_backup;
    PRINT '✓ Dropped successfully'
END
ELSE
BEGIN
    PRINT '✗ donations_backup not found'
END
GO

-- Drop transfers_normalized if exists
IF OBJECT_ID('transfers_normalized', 'U') IS NOT NULL
BEGIN
    PRINT 'Dropping transfers_normalized...'
    
    -- First drop any foreign key constraints
    DECLARE @constraint NVARCHAR(200)
    DECLARE constraint_cursor CURSOR FOR
    SELECT name FROM sys.foreign_keys 
    WHERE parent_object_id = OBJECT_ID('transfers_normalized')
    
    OPEN constraint_cursor
    FETCH NEXT FROM constraint_cursor INTO @constraint
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC('ALTER TABLE transfers_normalized DROP CONSTRAINT ' + @constraint)
        PRINT '  Dropped FK: ' + @constraint
        FETCH NEXT FROM constraint_cursor INTO @constraint
    END
    CLOSE constraint_cursor
    DEALLOCATE constraint_cursor
    
    DROP TABLE transfers_normalized;
    PRINT '✓ Dropped successfully'
END
ELSE
BEGIN
    PRINT '✗ transfers_normalized not found'
END
GO

-- Drop hospitals_normalized if exists
IF OBJECT_ID('hospitals_normalized', 'U') IS NOT NULL
BEGIN
    PRINT 'Dropping hospitals_normalized...'
    
    -- First drop any foreign key constraints pointing to it
    DECLARE @fk NVARCHAR(200)
    DECLARE fk_cursor CURSOR FOR
    SELECT f.name
    FROM sys.foreign_keys AS f
    WHERE f.referenced_object_id = OBJECT_ID('hospitals_normalized')
    
    OPEN fk_cursor
    FETCH NEXT FROM fk_cursor INTO @fk
    WHILE @@FETCH_STATUS = 0
    BEGIN
        DECLARE @parentTable NVARCHAR(128)
        SELECT @parentTable = OBJECT_NAME(parent_object_id)
        FROM sys.foreign_keys
        WHERE name = @fk
        
        EXEC('ALTER TABLE ' + @parentTable + ' DROP CONSTRAINT ' + @fk)
        PRINT '  Dropped FK: ' + @fk + ' from ' + @parentTable
        FETCH NEXT FROM fk_cursor INTO @fk
    END
    CLOSE fk_cursor
    DEALLOCATE fk_cursor
    
    DROP TABLE hospitals_normalized;
    PRINT '✓ Dropped successfully'
END
ELSE
BEGIN
    PRINT '✗ hospitals_normalized not found'
END
GO

-- Drop donors_normalized if exists
IF OBJECT_ID('donors_normalized', 'U') IS NOT NULL
BEGIN
    PRINT 'Dropping donors_normalized...'
    
    -- First drop any foreign key constraints
    DECLARE @fk2 NVARCHAR(200)
    DECLARE fk_cursor2 CURSOR FOR
    SELECT name FROM sys.foreign_keys 
    WHERE parent_object_id = OBJECT_ID('donors_normalized')
       OR referenced_object_id = OBJECT_ID('donors_normalized')
    
    OPEN fk_cursor2
    FETCH NEXT FROM fk_cursor2 INTO @fk2
    WHILE @@FETCH_STATUS = 0
    BEGIN
        DECLARE @table2 NVARCHAR(128)
        SELECT @table2 = OBJECT_NAME(parent_object_id)
        FROM sys.foreign_keys
        WHERE name = @fk2
        
        EXEC('ALTER TABLE ' + @table2 + ' DROP CONSTRAINT ' + @fk2)
        PRINT '  Dropped FK: ' + @fk2
        FETCH NEXT FROM fk_cursor2 INTO @fk2
    END
    CLOSE fk_cursor2
    DEALLOCATE fk_cursor2
    
    DROP TABLE donors_normalized;
    PRINT '✓ Dropped successfully'
END
ELSE
BEGIN
    PRINT '✗ donors_normalized not found'
END
GO

-- postal_codes table is kept (used for normalization)
IF OBJECT_ID('postal_codes', 'U') IS NOT NULL
BEGIN
    PRINT '✓ postal_codes exists (keeping - used for address normalization)'
END
GO

-- Drop dated backup tables (e.g., blood_requests_backup_20251228)
PRINT ''
PRINT 'Checking for dated backup tables...'
GO

IF OBJECT_ID('blood_requests_backup_20251228', 'U') IS NOT NULL
BEGIN
    PRINT 'Dropping blood_requests_backup_20251228...'
    DROP TABLE blood_requests_backup_20251228;
    PRINT '✓ Dropped successfully'
END
GO

IF OBJECT_ID('donors_backup_20251228', 'U') IS NOT NULL
BEGIN
    PRINT 'Dropping donors_backup_20251228...'
    DROP TABLE donors_backup_20251228;
    PRINT '✓ Dropped successfully'
END
GO

IF OBJECT_ID('hospitals_backup_20251228', 'U') IS NOT NULL
BEGIN
    PRINT 'Dropping hospitals_backup_20251228...'
    DROP TABLE hospitals_backup_20251228;
    PRINT '✓ Dropped successfully'
END
GO

IF OBJECT_ID('request_hospitals_backup_20251228', 'U') IS NOT NULL
BEGIN
    PRINT 'Dropping request_hospitals_backup_20251228...'
    DROP TABLE request_hospitals_backup_20251228;
    PRINT '✓ Dropped successfully'
END
GO

IF OBJECT_ID('transfers_backup_20251228', 'U') IS NOT NULL
BEGIN
    PRINT 'Dropping transfers_backup_20251228...'
    DROP TABLE transfers_backup_20251228;
    PRINT '✓ Dropped successfully'
END
GO

-- Drop any other tables with _backup suffix (generic cleanup)
DECLARE @backupTable NVARCHAR(128)
DECLARE backup_cursor CURSOR FOR
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
  AND (
    TABLE_NAME LIKE '%_backup%' OR 
    TABLE_NAME LIKE '%_old%' OR
    TABLE_NAME LIKE '%_copy%' OR
    TABLE_NAME LIKE '%_temp%'
  )
  AND TABLE_NAME NOT IN (
    'hospitals', 'donors', 'donations', 'transfers', 
    'blood_requests', 'request_hospitals', 'requesters'
  )

OPEN backup_cursor
FETCH NEXT FROM backup_cursor INTO @backupTable

WHILE @@FETCH_STATUS = 0
BEGIN
    PRINT 'Dropping ' + @backupTable + '...'
    
    -- Drop foreign key constraints first
    DECLARE @fkName NVARCHAR(200)
    DECLARE fk_cleanup_cursor CURSOR FOR
    SELECT name FROM sys.foreign_keys 
    WHERE parent_object_id = OBJECT_ID(@backupTable)
       OR referenced_object_id = OBJECT_ID(@backupTable)
    
    OPEN fk_cleanup_cursor
    FETCH NEXT FROM fk_cleanup_cursor INTO @fkName
    WHILE @@FETCH_STATUS = 0
    BEGIN
        DECLARE @fkTable NVARCHAR(128)
        SELECT @fkTable = OBJECT_NAME(parent_object_id)
        FROM sys.foreign_keys WHERE name = @fkName
        
        EXEC('ALTER TABLE ' + @fkTable + ' DROP CONSTRAINT ' + @fkName)
        PRINT '  Dropped FK: ' + @fkName
        FETCH NEXT FROM fk_cleanup_cursor INTO @fkName
    END
    CLOSE fk_cleanup_cursor
    DEALLOCATE fk_cleanup_cursor
    
    EXEC('DROP TABLE ' + @backupTable)
    PRINT '✓ Dropped successfully'
    FETCH NEXT FROM backup_cursor INTO @backupTable
END

CLOSE backup_cursor
DEALLOCATE backup_cursor
GO

PRINT ''
PRINT '=== CLEANUP COMPLETE ==='
PRINT ''
PRINT 'Remaining tables:'
GO

SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;
GO
