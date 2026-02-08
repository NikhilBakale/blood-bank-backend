-- Migration: Normalize TRANSFERS table to 3NF
-- Date: 2025-12-28
-- Purpose: Remove redundant columns (blood_type, rh_factor, component_type, volume_ml, donor_id)
--          These can be derived from blood_id via donations table

-- Step 1: Create backup of current transfers table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'transfers_backup_20251228')
BEGIN
    SELECT * INTO transfers_backup_20251228 FROM transfers;
    PRINT '✅ Backup created: transfers_backup_20251228';
END

-- Step 2: Create new normalized transfers table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'transfers_normalized')
BEGIN
    CREATE TABLE transfers_normalized (
        transfer_id INT IDENTITY(1,1) PRIMARY KEY,
        blood_id VARCHAR(50) NOT NULL,
        request_id UNIQUEIDENTIFIER NOT NULL,
        hospital_id VARCHAR(10) NOT NULL,
        recipient_name NVARCHAR(255) NULL,
        recipient_contact VARCHAR(20) NULL,
        transfer_date DATETIME DEFAULT GETDATE(),
        notes NVARCHAR(500) NULL,
        created_at DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id),
        FOREIGN KEY (request_id) REFERENCES blood_requests(request_id)
    );

    -- Create indexes for performance
    CREATE INDEX IX_transfers_normalized_blood_id ON transfers_normalized(blood_id);
    CREATE INDEX IX_transfers_normalized_hospital_id ON transfers_normalized(hospital_id);
    CREATE INDEX IX_transfers_normalized_request_id ON transfers_normalized(request_id);
    CREATE INDEX IX_transfers_normalized_transfer_date ON transfers_normalized(transfer_date);
    
    PRINT '✅ Created normalized transfers table';
END

-- Step 3: Migrate data (keep only non-redundant columns)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'transfers')
    AND EXISTS (SELECT * FROM sys.tables WHERE name = 'transfers_normalized')
    AND NOT EXISTS (SELECT * FROM transfers_normalized)
BEGIN
    SET IDENTITY_INSERT transfers_normalized ON;
    
    INSERT INTO transfers_normalized (
        transfer_id, blood_id, request_id, hospital_id,
        recipient_name, recipient_contact, transfer_date, notes, created_at
    )
    SELECT 
        transfer_id, blood_id, request_id, hospital_id,
        recipient_name, recipient_contact, transfer_date, notes, created_at
    FROM transfers;
    
    SET IDENTITY_INSERT transfers_normalized OFF;
    
    PRINT '✅ Migrated ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' records to normalized table';
END

-- Step 4: Create view for backward compatibility
-- This view joins with donations table to provide the same columns as before
IF EXISTS (SELECT * FROM sys.views WHERE name = 'transfers_view')
    DROP VIEW transfers_view;
GO

CREATE VIEW transfers_view AS
SELECT 
    t.transfer_id,
    t.blood_id,
    t.request_id,
    t.hospital_id,
    d.donor_id,
    d.blood_type,
    d.rh_factor,
    d.component_type,
    d.volume_ml,
    t.recipient_name,
    t.recipient_contact,
    t.transfer_date,
    t.notes,
    t.created_at
FROM transfers_normalized t
LEFT JOIN donations d ON t.blood_id = d.blood_id;
GO

PRINT '✅ Created transfers_view for backward compatibility';

-- Step 5: Rename tables (swap old and new)
-- Only execute this after testing!
-- Uncomment these lines when ready to deploy:

/*
-- Drop foreign key constraints on old transfers table
DECLARE @constraint_name NVARCHAR(200);
DECLARE constraint_cursor CURSOR FOR 
    SELECT name FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID('transfers');

OPEN constraint_cursor;
FETCH NEXT FROM constraint_cursor INTO @constraint_name;

WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC('ALTER TABLE transfers DROP CONSTRAINT ' + @constraint_name);
    FETCH NEXT FROM constraint_cursor INTO @constraint_name;
END

CLOSE constraint_cursor;
DEALLOCATE constraint_cursor;

-- Rename old table to archive
EXEC sp_rename 'transfers', 'transfers_old';
PRINT '✅ Renamed old transfers table to transfers_old';

-- Rename new table to transfers
EXEC sp_rename 'transfers_normalized', 'transfers';
PRINT '✅ Renamed transfers_normalized to transfers';

-- Update view to use new table name
DROP VIEW transfers_view;
GO

CREATE VIEW transfers_view AS
SELECT 
    t.transfer_id,
    t.blood_id,
    t.request_id,
    t.hospital_id,
    d.donor_id,
    d.blood_type,
    d.rh_factor,
    d.component_type,
    d.volume_ml,
    t.recipient_name,
    t.recipient_contact,
    t.transfer_date,
    t.notes,
    t.created_at
FROM transfers t
LEFT JOIN donations d ON t.blood_id = d.blood_id;
GO

PRINT '✅✅✅ Migration complete! Transfers table is now 3NF compliant.';
*/

PRINT '';
PRINT '=================================================================';
PRINT 'MIGRATION READY - NOT YET DEPLOYED';
PRINT '=================================================================';
PRINT 'Next steps:';
PRINT '1. Test queries using transfers_normalized table';
PRINT '2. Test the transfers_view to ensure backward compatibility';
PRINT '3. Uncomment Step 5 to deploy the changes';
PRINT '=================================================================';
