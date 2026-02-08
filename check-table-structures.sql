-- Check current table structures and views

PRINT '=== DONORS TABLE STRUCTURE ==='
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'donors'
ORDER BY ORDINAL_POSITION;
GO

PRINT ''
PRINT '=== POSTAL_CODES TABLE STRUCTURE ==='
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'postal_codes'
ORDER BY ORDINAL_POSITION;
GO

PRINT ''
PRINT '=== CHECK IF DONORS_VIEW EXISTS ==='
IF EXISTS (SELECT * FROM sys.views WHERE name = 'donors_view')
BEGIN
    PRINT '✓ donors_view exists'
    
    -- Show view definition
    SELECT OBJECT_DEFINITION(OBJECT_ID('donors_view')) AS view_definition;
END
ELSE
BEGIN
    PRINT '✗ donors_view DOES NOT EXIST'
    PRINT '   This is why donors are not showing city/state!'
END
GO

PRINT ''
PRINT '=== SAMPLE DATA ==='
PRINT 'Donors table (first 3 rows):'
SELECT TOP 3 donor_id, first_name, last_name, postal_code FROM donors;
GO

PRINT ''
PRINT 'Postal_codes table (first 5 rows):'
SELECT TOP 5 * FROM postal_codes;
GO
