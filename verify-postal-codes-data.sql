-- Verify postal_codes data and view definitions

PRINT '=== POSTAL_CODES TABLE ROW COUNT ==='
SELECT COUNT(*) AS postal_codes_count FROM postal_codes;
GO

PRINT ''
PRINT '=== SAMPLE POSTAL_CODES DATA ==='
SELECT TOP 10 * FROM postal_codes ORDER BY postal_code;
GO

PRINT ''
PRINT '=== DONORS_VIEW DEFINITION ==='
SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.donors_view')) AS donors_view_definition;
GO

PRINT ''
PRINT '=== HOSPITALS_VIEW DEFINITION ==='
SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.hospitals_view')) AS hospitals_view_definition;
GO

PRINT ''
PRINT '=== CHECK FOR ORPHANED POSTAL_CODES IN DONORS ==='
PRINT 'Donors with postal_codes that do not exist in postal_codes table:'
SELECT 
    d.donor_id,
    d.first_name,
    d.last_name,
    d.postal_code AS donor_postal_code,
    CASE WHEN pc.postal_code IS NULL THEN 'MISSING' ELSE 'EXISTS' END AS postal_code_status
FROM donors d
LEFT JOIN postal_codes pc ON d.postal_code = pc.postal_code
WHERE d.postal_code IS NOT NULL AND pc.postal_code IS NULL;
GO

PRINT ''
PRINT '=== CHECK FOR ORPHANED POSTAL_CODES IN HOSPITALS ==='
PRINT 'Hospitals with postal_codes that do not exist in postal_codes table:'
SELECT 
    h.hospital_id,
    h.name,
    h.postal_code AS hospital_postal_code,
    CASE WHEN pc.postal_code IS NULL THEN 'MISSING' ELSE 'EXISTS' END AS postal_code_status
FROM hospitals h
LEFT JOIN postal_codes pc ON h.postal_code = pc.postal_code
WHERE h.postal_code IS NOT NULL AND pc.postal_code IS NULL;
GO

PRINT ''
PRINT '=== TEST DONORS_VIEW QUERY ==='
PRINT 'Sample from donors_view (should show city and state):'
SELECT TOP 5 
    donor_id, 
    first_name, 
    last_name, 
    postal_code, 
    city, 
    state,
    address
FROM donors_view
ORDER BY donor_id;
GO
