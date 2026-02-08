-- Migration: Create postal_codes table for 3NF compliance
-- Date: 2025-12-28
-- Purpose: Eliminate transitive dependencies in HOSPITALS and DONORS tables
--          postal_code → city, state (violates 3NF)

-- Step 1: Create postal_codes table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'postal_codes')
BEGIN
    CREATE TABLE postal_codes (
        postal_code VARCHAR(10) PRIMARY KEY,
        city NVARCHAR(100) NOT NULL,
        state VARCHAR(50) NOT NULL,
        country VARCHAR(50) DEFAULT 'USA',
        created_at DATETIME DEFAULT GETDATE()
    );
    
    CREATE INDEX IX_postal_codes_city ON postal_codes(city);
    CREATE INDEX IX_postal_codes_state ON postal_codes(state);
    
    PRINT '✅ Created postal_codes table';
END

-- Step 2: Populate postal_codes from existing data
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'postal_codes')
BEGIN
    -- Extract unique postal codes from hospitals
    INSERT INTO postal_codes (postal_code, city, state)
    SELECT DISTINCT postal_code, city, state
    FROM hospitals
    WHERE postal_code IS NOT NULL 
        AND city IS NOT NULL 
        AND state IS NOT NULL
        AND NOT EXISTS (
            SELECT 1 FROM postal_codes pc 
            WHERE pc.postal_code = hospitals.postal_code
        );
    
    DECLARE @hospitals_count INT = @@ROWCOUNT;
    
    -- Extract unique postal codes from donors (that aren't already in table)
    INSERT INTO postal_codes (postal_code, city, state)
    SELECT DISTINCT postal_code, city, state
    FROM donors
    WHERE postal_code IS NOT NULL 
        AND city IS NOT NULL 
        AND state IS NOT NULL
        AND NOT EXISTS (
            SELECT 1 FROM postal_codes pc 
            WHERE pc.postal_code = donors.postal_code
        );
    
    DECLARE @donors_count INT = @@ROWCOUNT;
    
    PRINT '✅ Populated postal_codes with ' + 
          CAST(@hospitals_count AS VARCHAR(10)) + ' from hospitals, ' +
          CAST(@donors_count AS VARCHAR(10)) + ' from donors';
END

-- Step 3: Create backup tables before modifying structure
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'hospitals_backup_20251228')
BEGIN
    SELECT * INTO hospitals_backup_20251228 FROM hospitals;
    PRINT '✅ Backup created: hospitals_backup_20251228';
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'donors_backup_20251228')
BEGIN
    SELECT * INTO donors_backup_20251228 FROM donors;
    PRINT '✅ Backup created: donors_backup_20251228';
END

-- Step 4: Create normalized tables
-- HOSPITALS_NORMALIZED (without city, state columns)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'hospitals_normalized')
BEGIN
    CREATE TABLE hospitals_normalized (
        hospital_id VARCHAR(10) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL,
        address NVARCHAR(500),
        postal_code VARCHAR(10),
        phone VARCHAR(20),
        email VARCHAR(255),
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (postal_code) REFERENCES postal_codes(postal_code)
    );
    
    -- Migrate data
    INSERT INTO hospitals_normalized (
        hospital_id, name, address, postal_code, phone, email, created_at, updated_at
    )
    SELECT 
        hospital_id, name, address, postal_code, phone, email, created_at, updated_at
    FROM hospitals;
    
    PRINT '✅ Created and populated hospitals_normalized';
END

-- DONORS_NORMALIZED (without city, state columns)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'donors_normalized')
BEGIN
    CREATE TABLE donors_normalized (
        donor_id INT IDENTITY(1,1) PRIMARY KEY,
        hospital_id VARCHAR(10) NOT NULL,
        first_name NVARCHAR(100) NOT NULL,
        last_name NVARCHAR(100) NOT NULL,
        date_of_birth DATE,
        gender VARCHAR(10),
        phone VARCHAR(20),
        email VARCHAR(255),
        address NVARCHAR(500),
        postal_code VARCHAR(10),
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id),
        FOREIGN KEY (postal_code) REFERENCES postal_codes(postal_code)
    );
    
    -- Migrate data
    SET IDENTITY_INSERT donors_normalized ON;
    
    INSERT INTO donors_normalized (
        donor_id, hospital_id, first_name, last_name, date_of_birth, gender,
        phone, email, address, postal_code, created_at, updated_at
    )
    SELECT 
        donor_id, hospital_id, first_name, last_name, date_of_birth, gender,
        phone, email, address, postal_code, created_at, updated_at
    FROM donors;
    
    SET IDENTITY_INSERT donors_normalized OFF;
    
    PRINT '✅ Created and populated donors_normalized';
END

-- Step 5: Create views for backward compatibility
IF EXISTS (SELECT * FROM sys.views WHERE name = 'hospitals_view')
    DROP VIEW hospitals_view;
GO

CREATE VIEW hospitals_view AS
SELECT 
    h.hospital_id,
    h.name,
    h.address,
    pc.city,
    pc.state,
    h.postal_code,
    h.phone,
    h.email,
    h.created_at,
    h.updated_at
FROM hospitals_normalized h
LEFT JOIN postal_codes pc ON h.postal_code = pc.postal_code;
GO

PRINT '✅ Created hospitals_view for backward compatibility';

IF EXISTS (SELECT * FROM sys.views WHERE name = 'donors_view')
    DROP VIEW donors_view;
GO

CREATE VIEW donors_view AS
SELECT 
    d.donor_id,
    d.hospital_id,
    d.first_name,
    d.last_name,
    d.date_of_birth,
    d.gender,
    d.phone,
    d.email,
    d.address,
    pc.city,
    pc.state,
    d.postal_code,
    d.created_at,
    d.updated_at
FROM donors_normalized d
LEFT JOIN postal_codes pc ON d.postal_code = pc.postal_code;
GO

PRINT '✅ Created donors_view for backward compatibility';

-- Step 6: Rename tables (UNCOMMENT WHEN READY TO DEPLOY)
/*
-- Drop old foreign key constraints
DECLARE @constraint_name NVARCHAR(200);

-- Drop constraints on hospitals
DECLARE constraint_cursor CURSOR FOR 
    SELECT name FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID('hospitals');
OPEN constraint_cursor;
FETCH NEXT FROM constraint_cursor INTO @constraint_name;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC('ALTER TABLE hospitals DROP CONSTRAINT ' + @constraint_name);
    FETCH NEXT FROM constraint_cursor INTO @constraint_name;
END
CLOSE constraint_cursor;
DEALLOCATE constraint_cursor;

-- Drop constraints on donors
DECLARE constraint_cursor2 CURSOR FOR 
    SELECT name FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID('donors');
OPEN constraint_cursor2;
FETCH NEXT FROM constraint_cursor2 INTO @constraint_name;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC('ALTER TABLE donors DROP CONSTRAINT ' + @constraint_name);
    FETCH NEXT FROM constraint_cursor2 INTO @constraint_name;
END
CLOSE constraint_cursor2;
DEALLOCATE constraint_cursor2;

-- Rename old tables
EXEC sp_rename 'hospitals', 'hospitals_old';
EXEC sp_rename 'donors', 'donors_old';

-- Rename new tables
EXEC sp_rename 'hospitals_normalized', 'hospitals';
EXEC sp_rename 'donors_normalized', 'donors';

PRINT '✅✅✅ Migration complete! HOSPITALS and DONORS are now 3NF compliant.';
*/

PRINT '';
PRINT '=================================================================';
PRINT 'POSTAL CODES MIGRATION READY - NOT YET DEPLOYED';
PRINT '=================================================================';
PRINT 'Next steps:';
PRINT '1. Test queries using hospitals_normalized and donors_normalized';
PRINT '2. Test the views to ensure backward compatibility';
PRINT '3. Update application code to use new table structure';
PRINT '4. Uncomment Step 6 to deploy the changes';
PRINT '=================================================================';
