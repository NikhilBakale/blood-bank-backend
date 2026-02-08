-- Blood Inventory Management System - SQL Schema
-- Azure SQL Database Schema

-- Drop existing views if they exist (views must be dropped before tables)
DROP VIEW IF EXISTS donor_donation_history;
GO
DROP VIEW IF EXISTS available_blood_inventory;
GO

-- Drop existing tables if they exist
DROP TABLE IF EXISTS donations;
GO
DROP TABLE IF EXISTS donors;
GO
DROP TABLE IF EXISTS hospitals;
GO

-- Create hospitals table (reference for hospital_id from Cosmos DB)
CREATE TABLE hospitals (
    hospital_id VARCHAR(10) PRIMARY KEY,
    email NVARCHAR(255) NOT NULL UNIQUE,
    hospital_name NVARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    address NVARCHAR(255),
    city NVARCHAR(100),
    state VARCHAR(50),
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);
GO

-- Create donors table
CREATE TABLE donors (
    donor_id INT PRIMARY KEY IDENTITY(1,1),
    hospital_id VARCHAR(10) NOT NULL,
    first_name NVARCHAR(100) NOT NULL,
    last_name NVARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(10) NOT NULL,
    phone VARCHAR(20),
    email NVARCHAR(100),
    address NVARCHAR(255),
    city NVARCHAR(100),
    state VARCHAR(50),
    postal_code VARCHAR(10),
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_donors_hospital FOREIGN KEY (hospital_id) REFERENCES [dbo].[hospitals](hospital_id)
);
GO

-- Create donations table (blood inventory)
CREATE TABLE donations (
    blood_id NVARCHAR(50) PRIMARY KEY,
    donor_id INT NOT NULL,
    hospital_id VARCHAR(10) NOT NULL,
    blood_type VARCHAR(5) NOT NULL,
    rh_factor VARCHAR(1) NOT NULL,
    component_type NVARCHAR(50) NOT NULL,
    volume_ml INT NOT NULL,
    collection_date DATETIME NOT NULL,
    expiry_date DATETIME NOT NULL,
    status VARCHAR(20) DEFAULT 'available',
    storage_location NVARCHAR(100),
    test_result_hiv VARCHAR(20),
    test_result_hbsag VARCHAR(20),
    test_result_hcv VARCHAR(20),
    test_result_syphilis VARCHAR(20),
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_donations_donor FOREIGN KEY (donor_id) REFERENCES donors(donor_id),
    CONSTRAINT FK_donations_hospital FOREIGN KEY (hospital_id) REFERENCES [dbo].[hospitals](hospital_id),
    CONSTRAINT CHK_volume_positive CHECK (volume_ml > 0),
    CONSTRAINT CHK_expiry_after_collection CHECK (expiry_date > collection_date)
);
GO

-- Create indexes for better query performance
CREATE INDEX IDX_donors_hospital_id ON donors(hospital_id);
GO
CREATE INDEX IDX_donors_email ON donors(email);
GO
CREATE INDEX IDX_donations_donor_id ON donations(donor_id);
GO
CREATE INDEX IDX_donations_hospital_id ON donations(hospital_id);
GO
CREATE INDEX IDX_donations_blood_id ON donations(blood_id);
GO
CREATE INDEX IDX_donations_status ON donations(status);
GO
CREATE INDEX IDX_donations_expiry_date ON donations(expiry_date);
GO
CREATE INDEX IDX_donations_blood_type ON donations(blood_type, rh_factor);
GO

-- Create view for current blood inventory (non-expired, available)
CREATE VIEW available_blood_inventory AS
SELECT 
    d.blood_id,
    d.donor_id,
    do.first_name,
    do.last_name,
    d.hospital_id,
    d.blood_type,
    d.rh_factor,
    d.component_type,
    d.volume_ml,
    d.collection_date,
    d.expiry_date,
    DATEDIFF(DAY, GETDATE(), d.expiry_date) AS days_until_expiry,
    d.storage_location,
    d.status
FROM donations d
INNER JOIN donors do ON d.donor_id = do.donor_id
WHERE d.status = 'available' 
    AND d.expiry_date > GETDATE();
GO

-- Create view for donor donation history
CREATE VIEW donor_donation_history AS
SELECT 
    do.donor_id,
    do.first_name,
    do.last_name,
    do.hospital_id,
    d.blood_id,
    d.blood_type,
    d.rh_factor,
    d.component_type,
    d.volume_ml,
    d.collection_date,
    d.status,
    d.expiry_date
FROM donations d
INNER JOIN donors do ON d.donor_id = do.donor_id;
GO
