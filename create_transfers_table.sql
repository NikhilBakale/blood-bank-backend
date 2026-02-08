-- Create transfers table
CREATE TABLE transfers (
    transfer_id INT IDENTITY(1,1) PRIMARY KEY,
    blood_id VARCHAR(50) NOT NULL,
    request_id UNIQUEIDENTIFIER NOT NULL,
    hospital_id VARCHAR(10) NOT NULL,
    donor_id INT NULL,
    blood_type VARCHAR(5) NOT NULL,
    rh_factor VARCHAR(10) NOT NULL,
    component_type VARCHAR(50) NOT NULL,
    volume_ml INT NOT NULL,
    recipient_name NVARCHAR(255) NULL,
    recipient_contact VARCHAR(20) NULL,
    transfer_date DATETIME DEFAULT GETDATE(),
    notes NVARCHAR(500) NULL,
    created_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id),
    FOREIGN KEY (request_id) REFERENCES blood_requests(request_id)
);
