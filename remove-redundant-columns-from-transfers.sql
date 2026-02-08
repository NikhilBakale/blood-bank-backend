-- Remove redundant columns from transfers table
-- These columns create transitive dependencies (3NF violation)
-- Blood details should only be stored in the donations table

-- Remove donor_id (can be retrieved via blood_id -> donations -> donor_id)
ALTER TABLE transfers
DROP COLUMN donor_id;

-- Remove blood_type (can be retrieved via blood_id -> donations -> blood_type)
ALTER TABLE transfers
DROP COLUMN blood_type;

-- Remove rh_factor (can be retrieved via blood_id -> donations -> rh_factor)
ALTER TABLE transfers
DROP COLUMN rh_factor;

-- Remove component_type (can be retrieved via blood_id -> donations -> component_type)
ALTER TABLE transfers
DROP COLUMN component_type;

-- Remove volume_ml (can be retrieved via blood_id -> donations -> volume_ml)
ALTER TABLE transfers
DROP COLUMN volume_ml;

-- Remove recipient_name (can be retrieved via request_id -> blood_requests -> patient_name)
-- This is a transitive dependency: transfer_id -> request_id -> patient_name
ALTER TABLE transfers
DROP COLUMN recipient_name;

-- Remove recipient_contact (can be retrieved via request_id -> blood_requests -> contact_number)
-- This is a transitive dependency: transfer_id -> request_id -> contact_number
ALTER TABLE transfers
DROP COLUMN recipient_contact;

-- Verify the remaining structure
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'transfers'
ORDER BY ORDINAL_POSITION;
