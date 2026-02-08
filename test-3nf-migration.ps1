# Test 3NF Migration
# This script tests the normalized database structure

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing 3NF Database Structure" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Load .env file if it exists
if (Test-Path ".env") {
    Write-Host "Loading configuration from .env file..." -ForegroundColor Cyan
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
    Write-Host "✅ Configuration loaded" -ForegroundColor Green
    Write-Host ""
}

$serverName = $env:SQL_SERVER
$database = $env:SQL_DATABASE
$username = $env:SQL_USERNAME
$password = $env:SQL_PASSWORD

if (-not $serverName -or -not $database) {
    Write-Host "❌ Error: SQL_SERVER or SQL_DATABASE not found in .env file" -ForegroundColor Red
    exit 1
}

Write-Host "Testing against: $serverName/$database" -ForegroundColor Green
Write-Host ""

# Build sqlcmd auth parameters
$authParams = if ($username -and $password) { "-U $username -P $password" } else { "-G" }

# Test 1: Check if normalized tables exist
Write-Host "Test 1: Checking if normalized tables exist..." -ForegroundColor Yellow
$checkTables = @"
SELECT 
    'transfers_normalized' as table_name, 
    COUNT(*) as exists 
FROM sys.tables WHERE name = 'transfers_normalized'
UNION ALL
SELECT 
    'hospitals_normalized', 
    COUNT(*) 
FROM sys.tables WHERE name = 'hospitals_normalized'
UNION ALL
SELECT 
    'donors_normalized', 
    COUNT(*) 
FROM sys.tables WHERE name = 'donors_normalized'
UNION ALL
SELECT 
    'postal_codes', 
    COUNT(*) 
FROM sys.tables WHERE name = 'postal_codes';
"@

Invoke-Expression "sqlcmd -S $serverName -d $database $authParams -Q `"$checkTables`" -h -1"
Write-Host "✅ Table check complete" -ForegroundColor Green
Write-Host ""

# Test 2: Check row counts
Write-Host "Test 2: Comparing row counts..." -ForegroundColor Yellow
$checkCounts = @"
SELECT 'transfers (old)' as table_name, COUNT(*) as row_count FROM transfers
UNION ALL
SELECT 'transfers_normalized', COUNT(*) FROM transfers_normalized
UNION ALL
SELECT 'hospitals (old)', COUNT(*) FROM hospitals
UNION ALL
SELECT 'hospitals_normalized', COUNT(*) FROM hospitals_normalized
UNION ALL
SELECT 'donors (old)', COUNT(*) FROM donors
UNION ALL
SELECT 'donors_normalized', COUNT(*) FROM donors_normalized
UNION ALL
SELECT 'postal_codes', COUNT(*) FROM postal_codes;
"@

Invoke-Expression "sqlcmd -S $serverName -d $database $authParams -Q `"$checkCounts`" -h -1"
Write-Host "✅ Row count check complete" -ForegroundColor Green
Write-Host ""

# Test 3: Test transfers_view
Write-Host "Test 3: Testing transfers_view..." -ForegroundColor Yellow
$testTransfersView = @"
SELECT TOP 5
    transfer_id,
    blood_id,
    donor_id,
    blood_type,
    component_type
FROM transfers_view
ORDER BY transfer_id DESC;
"@

Invoke-Expression "sqlcmd -S $serverName -d $database $authParams -Q `"$testTransfersView`" -h -1"
Write-Host "✅ transfers_view test complete" -ForegroundColor Green
Write-Host ""

# Test 4: Test hospitals_view
Write-Host "Test 4: Testing hospitals_view..." -ForegroundColor Yellow
$testHospitalsView = @"
SELECT TOP 5
    hospital_id,
    name,
    city,
    state,
    postal_code
FROM hospitals_view
ORDER BY hospital_id;
"@

Invoke-Expression "sqlcmd -S $serverName -d $database $authParams -Q `"$testHospitalsView`" -h -1"
Write-Host "✅ hospitals_view test complete" -ForegroundColor Green
Write-Host ""

# Test 5: Test donors_view
Write-Host "Test 5: Testing donors_view..." -ForegroundColor Yellow
$testDonorsView = @"
SELECT TOP 5
    donor_id,
    first_name,
    last_name,
    city,
    state,
    postal_code
FROM donors_view
ORDER BY donor_id DESC;
"@

Invoke-Expression "sqlcmd -S $serverName -d $database $authParams -Q `"$testDonorsView`" -h -1"
Write-Host "✅ donors_view test complete" -ForegroundColor Green
Write-Host ""

# Test 6: Verify JOIN performance (transfers with donations)
Write-Host "Test 6: Testing JOIN with donations table..." -ForegroundColor Yellow
$testJoin = @"
SELECT TOP 5
    t.transfer_id,
    t.blood_id,
    d.blood_type,
    d.rh_factor,
    d.component_type,
    d.volume_ml,
    d.donor_id
FROM transfers_normalized t
LEFT JOIN donations d ON t.blood_id = d.blood_id
ORDER BY t.transfer_id DESC;
"@

Invoke-Expression "sqlcmd -S $serverName -d $database $authParams -Q `"$testJoin`" -h -1"
Write-Host "✅ JOIN test complete" -ForegroundColor Green
Write-Host ""

# Test 7: Check for data consistency
Write-Host "Test 7: Checking data consistency..." -ForegroundColor Yellow
$checkConsistency = @"
-- Check if postal_codes match between old and new
SELECT 
    'City/State Match' as test,
    COUNT(*) as mismatches
FROM hospitals h
JOIN hospitals_normalized hn ON h.hospital_id = hn.hospital_id
LEFT JOIN postal_codes pc ON hn.postal_code = pc.postal_code
WHERE h.city != pc.city OR h.state != pc.state;
"@

Invoke-Expression "sqlcmd -S $serverName -d $database $authParams -Q `"$checkConsistency`" -h -1"
Write-Host "✅ Consistency check complete (0 mismatches = good)" -ForegroundColor Green
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "All tests completed!" -ForegroundColor Green
Write-Host ""
Write-Host "If all tests passed:" -ForegroundColor Yellow
Write-Host "1. ✅ Normalized tables have same row counts" -ForegroundColor White
Write-Host "2. ✅ Views return data correctly" -ForegroundColor White
Write-Host "3. ✅ JOINs work as expected" -ForegroundColor White
Write-Host "4. ✅ No data inconsistencies" -ForegroundColor White
Write-Host ""
Write-Host "Next step: Update migration scripts to activate changes" -ForegroundColor Cyan
Write-Host ""
