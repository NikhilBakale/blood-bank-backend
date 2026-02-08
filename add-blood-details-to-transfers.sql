-- Add blood details columns to transfers table for historical record
-- Since donations are deleted after transfer, we need to store the blood details

ALTER TABLE transfers
ADD donor_id INT NULL;

ALTER TABLE transfers
ADD blood_type VARCHAR(5) NULL;

ALTER TABLE transfers
ADD rh_factor VARCHAR(1) NULL;

ALTER TABLE transfers
ADD component_type NVARCHAR(50) NULL;

ALTER TABLE transfers
ADD volume_ml INT NULL;

-- Add foreign key constraint
ALTER TABLE transfers
ADD CONSTRAINT FK_transfers_donor
FOREIGN KEY (donor_id) REFERENCES donors(donor_id);

PRINT '✅ Added blood details columns to transfers table';
