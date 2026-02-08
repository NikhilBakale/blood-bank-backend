-- ============================================================================
-- RECREATE POSTAL_CODES TABLE FOR 3NF NORMALIZATION
-- ============================================================================
-- This table stores city/state data keyed by postal_code
-- Used by hospitals and donors tables via LEFT JOIN
-- Eliminates transitive dependency: postal_code → city, state
-- ============================================================================

PRINT '=== RECREATING POSTAL_CODES TABLE ==='
PRINT ''

-- Check if postal_codes already exists
IF OBJECT_ID('postal_codes', 'U') IS NOT NULL
BEGIN
    PRINT '⚠️  postal_codes table already exists'
    SELECT COUNT(*) AS existing_records FROM postal_codes;
    SELECT TOP 5 * FROM postal_codes ORDER BY postal_code;
END
ELSE
BEGIN
    PRINT 'Creating postal_codes table...'
    
    CREATE TABLE postal_codes (
        postal_code VARCHAR(10) PRIMARY KEY,
        city NVARCHAR(100) NOT NULL,
        state VARCHAR(50) NOT NULL,
        country VARCHAR(50) DEFAULT 'USA',
        created_at DATETIME DEFAULT GETDATE()
    );
    
    CREATE INDEX IX_postal_codes_city ON postal_codes(city);
    CREATE INDEX IX_postal_codes_state ON postal_codes(state);
    
    PRINT '✓ postal_codes table created'
    PRINT ''
    
    -- Populate from backup tables if they exist (they have city/state)
    PRINT 'Populating postal_codes from backup tables...'
    
    DECLARE @added INT = 0
    
    -- Try from hospitals backup
    IF OBJECT_ID('hospitals_backup_20251228', 'U') IS NOT NULL
    BEGIN
        INSERT INTO postal_codes (postal_code, city, state)
        SELECT DISTINCT 
            LTRIM(RTRIM(postal_code)) AS postal_code,
            LTRIM(RTRIM(city)) AS city,
            LTRIM(RTRIM(state)) AS state
        FROM hospitals_backup_20251228
        WHERE postal_code IS NOT NULL 
          AND city IS NOT NULL 
          AND state IS NOT NULL
          AND LTRIM(RTRIM(postal_code)) != '';
        
        SET @added = @@ROWCOUNT
        PRINT '  Added ' + CAST(@added AS VARCHAR) + ' postal codes from hospitals_backup_20251228'
    END
    
    -- Try from donors backup
    IF OBJECT_ID('donors_backup_20251228', 'U') IS NOT NULL
    BEGIN
        INSERT INTO postal_codes (postal_code, city, state)
        SELECT DISTINCT 
            LTRIM(RTRIM(postal_code)) AS postal_code,
            LTRIM(RTRIM(city)) AS city,
            LTRIM(RTRIM(state)) AS state
        FROM donors_backup_20251228
        WHERE postal_code IS NOT NULL 
          AND city IS NOT NULL 
          AND state IS NOT NULL
          AND LTRIM(RTRIM(postal_code)) != ''
          AND NOT EXISTS (
              SELECT 1 FROM postal_codes pc 
              WHERE pc.postal_code = LTRIM(RTRIM(donors_backup_20251228.postal_code))
          );
        
        SET @added = @@ROWCOUNT
        PRINT '  Added ' + CAST(@added AS VARCHAR) + ' postal codes from donors_backup_20251228'
    END
    
    -- Show summary
    DECLARE @total INT
    SELECT @total = COUNT(*) FROM postal_codes
    PRINT ''
    PRINT '✓ postal_codes table populated with ' + CAST(@total AS VARCHAR) + ' entries'
    
    -- Show sample
    PRINT ''
    PRINT 'Sample postal_codes:'
    SELECT TOP 10 postal_code, city, state FROM postal_codes ORDER BY postal_code
END
GO

PRINT ''
PRINT '=== ADD FOREIGN KEY CONSTRAINTS (OPTIONAL) ==='
PRINT ''
PRINT 'NOTE: Foreign key constraints are OPTIONAL'
PRINT 'They can help maintain data integrity but may cause issues if adding new data'
PRINT 'Current setup uses LEFT JOIN in queries without FK constraints'
PRINT ''
PRINT 'Uncomment below to add FK constraints if desired:'
PRINT ''

/*
-- Add FK to hospitals (if postal_code column exists)
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'hospitals' AND COLUMN_NAME = 'postal_code')
BEGIN
    ALTER TABLE hospitals
    ADD CONSTRAINT FK_hospitals_postal_code 
    FOREIGN KEY (postal_code) REFERENCES postal_codes(postal_code);
    
    PRINT '✓ Added FK constraint to hospitals.postal_code'
END

-- Add FK to donors (if postal_code column exists)  
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'donors' AND COLUMN_NAME = 'postal_code')
BEGIN
    ALTER TABLE donors
    ADD CONSTRAINT FK_donors_postal_code 
    FOREIGN KEY (postal_code) REFERENCES postal_codes(postal_code);
    
    PRINT '✓ Added FK constraint to donors.postal_code'
END
*/

PRINT ''
PRINT '=== POSTAL_CODES TABLE RECREATION COMPLETE ==='
PRINT ''
PRINT 'Usage in queries:'
PRINT '  SELECT d.*, pc.city, pc.state'
PRINT '  FROM donors d'
PRINT '  LEFT JOIN postal_codes pc ON d.postal_code = pc.postal_code'
PRINT '