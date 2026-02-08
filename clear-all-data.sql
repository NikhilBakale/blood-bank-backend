-- ================================================================
-- CLEAR ALL DATA FROM ALL TABLES
-- ================================================================
-- This script deletes all data from all tables in the correct order
-- to respect foreign key constraints.
--
-- WARNING: This will permanently delete ALL data!
-- ================================================================

PRINT '================================================';
PRINT 'STARTING DATA DELETION PROCESS';
PRINT '================================================';
PRINT '';

-- Step 1: Delete transfers (depends on donations and blood_requests)
PRINT 'Step 1: Deleting all transfers...';
DELETE FROM transfers;
PRINT 'Transfers deleted: ' + CAST(@@ROWCOUNT AS VARCHAR(10));
PRINT '';

-- Step 2: Delete request_hospitals (junction table)
PRINT 'Step 2: Deleting all request_hospitals...';
DELETE FROM request_hospitals;
PRINT 'Request_hospitals deleted: ' + CAST(@@ROWCOUNT AS VARCHAR(10));
PRINT '';

-- Step 3: Delete blood_requests
PRINT 'Step 3: Deleting all blood_requests...';
DELETE FROM blood_requests;
PRINT 'Blood_requests deleted: ' + CAST(@@ROWCOUNT AS VARCHAR(10));
PRINT '';

-- Step 4: Delete donations (depends on donors and hospitals)
PRINT 'Step 4: Deleting all donations...';
DELETE FROM donations;
PRINT 'Donations deleted: ' + CAST(@@ROWCOUNT AS VARCHAR(10));
PRINT '';

-- Step 5: Delete donors (depends on hospitals)
PRINT 'Step 5: Deleting all donors...';
DELETE FROM donors;
PRINT 'Donors deleted: ' + CAST(@@ROWCOUNT AS VARCHAR(10));
PRINT '';

-- Step 6: Delete requesters
PRINT 'Step 6: Deleting all requesters...';
DELETE FROM requesters;
PRINT 'Requesters deleted: ' + CAST(@@ROWCOUNT AS VARCHAR(10));
PRINT '';

-- Step 7: Delete hospitals (no dependencies from other tables now)
PRINT 'Step 7: Deleting all hospitals...';
DELETE FROM hospitals;
PRINT 'Hospitals deleted: ' + CAST(@@ROWCOUNT AS VARCHAR(10));
PRINT '';

PRINT '================================================';
PRINT 'ALL DATA DELETED SUCCESSFULLY!';
PRINT '================================================';
PRINT '';
PRINT 'All tables have been cleared.';
PRINT 'The database structure remains intact.';
PRINT 'You can now add fresh data.';
