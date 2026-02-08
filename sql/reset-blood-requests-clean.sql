-- ============================================================================
-- SIMPLE RESET: Fix Blood Requests Table (No Data Migration)
-- ============================================================================
-- This script drops the problematic column and creates the normalized structure
-- ⚠️ WARNING: This will DELETE all blood_requests data!
-- Use this only if you don't have important data to preserve
-- ============================================================================

-- Step 1: Drop existing data and problematic column
-- ============================================================================
PRINT '🗑️  Clearing blood_requests table and related data...';

-- First, delete from dependent tables (tables with FK to blood_requests)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'transfers')
BEGIN
  DELETE FROM transfers WHERE request_id IN (SELECT request_id FROM blood_requests);
  PRINT '  ✅ Cleared related transfers';
END

-- Delete from request_hospitals if it exists
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'request_hospitals')
BEGIN
  DELETE FROM request_hospitals;
  PRINT '  ✅ Cleared request_hospitals';
END

-- Now we can safely delete blood_requests
DELETE FROM blood_requests;

PRINT '✅ All data cleared';

-- Check if column exists before dropping
IF EXISTS (
  SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'blood_requests' AND COLUMN_NAME = 'selected_hospitals'
)
BEGIN
  -- Drop the JSON column
  ALTER TABLE blood_requests 
  DROP COLUMN selected_hospitals;
  PRINT '✅ Old column removed';
END
ELSE
BEGIN
  PRINT 'ℹ️  Column selected_hospitals does not exist (already removed or never existed)';
END
GO

-- Step 2: Create the new normalized junction table
-- ============================================================================
PRINT '📋 Creating request_hospitals table...';

-- Drop if exists (for clean slate)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'request_hospitals')
BEGIN
  DROP TABLE request_hospitals;
  PRINT '  Dropped existing table';
END

-- Create new normalized table
CREATE TABLE request_hospitals (
    id INT PRIMARY KEY IDENTITY(1,1),
    request_id UNIQUEIDENTIFIER NOT NULL,
    hospital_id VARCHAR(10) NOT NULL,
    hospital_name NVARCHAR(255) NULL,
    status NVARCHAR(50) DEFAULT 'pending',
    responded_at DATETIME NULL,
    notes NVARCHAR(500) NULL,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    
    -- Foreign key constraints
    CONSTRAINT FK_request_hospitals_requests 
        FOREIGN KEY (request_id) 
        REFERENCES blood_requests(request_id) 
        ON DELETE CASCADE,
    
    CONSTRAINT FK_request_hospitals_hospitals 
        FOREIGN KEY (hospital_id) 
        REFERENCES hospitals(hospital_id),
    
    -- Prevent duplicate entries
    CONSTRAINT UQ_request_hospital 
        UNIQUE (request_id, hospital_id)
);

PRINT '✅ Table created';
GO

-- Step 3: Create indexes for performance
-- ============================================================================
PRINT '📊 Creating indexes...';

CREATE INDEX idx_request_hospitals_hospital_id 
    ON request_hospitals(hospital_id);

CREATE INDEX idx_request_hospitals_request_id 
    ON request_hospitals(request_id);

CREATE INDEX idx_request_hospitals_status 
    ON request_hospitals(status);

CREATE INDEX idx_request_hospitals_created 
    ON request_hospitals(created_at);

PRINT '✅ Indexes created';
GO

-- Step 4: Create a helpful view (optional)
-- ============================================================================
PRINT '📋 Creating view...';

IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_blood_requests_with_hospitals')
BEGIN
  DROP VIEW vw_blood_requests_with_hospitals;
END
GO

CREATE VIEW vw_blood_requests_with_hospitals AS
SELECT 
    br.request_id,
    br.requester_id,
    br.patient_name,
    br.patient_age,
    br.blood_type,
    br.urgency,
    br.units_needed,
    br.contact_number,
    br.address,
    br.medical_notes,
    br.status AS request_status,
    br.created_at AS request_created_at,
    rh.hospital_id,
    rh.hospital_name,
    rh.status AS hospital_status,
    rh.responded_at,
    rh.notes AS hospital_notes
FROM blood_requests br
LEFT JOIN request_hospitals rh ON br.request_id = rh.request_id;
GO

PRINT '✅ View created';
GO

-- Step 5: Verify the new structure
-- ============================================================================
PRINT '';
PRINT '═══════════════════════════════════════════════════════════════';
PRINT '✅ ✅ ✅ DATABASE STRUCTURE UPDATED SUCCESSFULLY!';
PRINT '═══════════════════════════════════════════════════════════════';
PRINT '';
PRINT '📊 New Structure:';
PRINT '   • blood_requests table: Clean (no JSON column)';
PRINT '   • request_hospitals table: Created with proper FKs';
PRINT '   • Indexes: All created';
PRINT '   • View: vw_blood_requests_with_hospitals ready';
PRINT '';
PRINT '🎯 Your database is now in proper 3NF!';
PRINT '';
PRINT '⚠️  NEXT STEP: Update your application code';
PRINT '   See: NORMALIZATION_FIX_GUIDE.md (Step 5)';
PRINT '';
GO

-- Show the new table structure
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME IN ('blood_requests', 'request_hospitals')
ORDER BY TABLE_NAME, ORDINAL_POSITION;
