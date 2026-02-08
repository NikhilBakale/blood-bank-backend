# Deploy 3NF Normalization
# This script deploys the database normalization changes

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "3NF Database Normalization Deployment" -ForegroundColor Cyan
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

# Check if SQL Server connection is available
$serverName = $env:SQL_SERVER
$database = $env:SQL_DATABASE
$username = $env:SQL_USERNAME
$password = $env:SQL_PASSWORD

if (-not $serverName -or -not $database) {
    Write-Host "❌ Error: SQL_SERVER or SQL_DATABASE not found in .env file" -ForegroundColor Red
    Write-Host "Please check your .env file contains:" -ForegroundColor Yellow
    Write-Host "  SQL_SERVER=your-server.database.windows.net" -ForegroundColor White
    Write-Host "  SQL_DATABASE=your-database-name" -ForegroundColor White
    exit 1
}

Write-Host "Target Server: $serverName" -ForegroundColor Green
Write-Host "Target Database: $database" -ForegroundColor Green
Write-Host ""

# Step 1: Deploy TRANSFERS normalization
Write-Host "Step 1: Normalizing TRANSFERS table..." -ForegroundColor Yellow
Write-Host "This will:" -ForegroundColor White
Write-Host "  - Create backup: transfers_backup_20251228" -ForegroundColor White
Write-Host "  - Create normalized transfers table (no redundant blood data)" -ForegroundColor White
Write-Host "  - Create transfers_view for backward compatibility" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Deploy TRANSFERS normalization? (yes/no)"
if ($confirm -eq "yes") {
    try {
        if ($username -and $password) {
            sqlcmd -S $serverName -d $database -U $username -P $password -i "migrations\normalize_transfers_to_3nf.sql" -o "logs\transfers_migration.log"
        } else {
            sqlcmd -S $serverName -d $database -G -i "migrations\normalize_transfers_to_3nf.sql" -o "logs\transfers_migration.log"
        }
        Write-Host "✅ TRANSFERS table normalized" -ForegroundColor Green
        Write-Host "   Log: logs\transfers_migration.log" -ForegroundColor Gray
    }
    catch {
        Write-Host "❌ Error deploying TRANSFERS migration: $_" -ForegroundColor Red
        exit 1
    }
}
else {
    Write-Host "⏭️  Skipped TRANSFERS normalization" -ForegroundColor Yellow
}

Write-Host ""

# Step 2: Deploy POSTAL_CODES normalization
Write-Host "Step 2: Creating postal_codes table..." -ForegroundColor Yellow
Write-Host "This will:" -ForegroundColor White
Write-Host "  - Create postal_codes table" -ForegroundColor White
Write-Host "  - Extract postal codes from hospitals and donors" -ForegroundColor White
Write-Host "  - Create backups: hospitals_backup_20251228, donors_backup_20251228" -ForegroundColor White
Write-Host "  - Create normalized tables without city/state columns" -ForegroundColor White
Write-Host "  - Create views for backward compatibility" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Deploy POSTAL_CODES normalization? (yes/no)"
if ($confirm -eq "yes") {
    try {
        if ($username -and $password) {
            sqlcmd -S $serverName -d $database -U $username -P $password -i "migrations\create_postal_codes_table.sql" -o "logs\postal_codes_migration.log"
        } else {
            sqlcmd -S $serverName -d $database -G -i "migrations\create_postal_codes_table.sql" -o "logs\postal_codes_migration.log"
        }
        Write-Host "✅ POSTAL_CODES table created" -ForegroundColor Green
        Write-Host "   Log: logs\postal_codes_migration.log" -ForegroundColor Gray
    }
    catch {
        Write-Host "❌ Error deploying POSTAL_CODES migration: $_" -ForegroundColor Red
        exit 1
    }
}
else {
    Write-Host "⏭️  Skipped POSTAL_CODES normalization" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deployment Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Migrations created (NOT YET ACTIVE)" -ForegroundColor Green
Write-Host ""
Write-Host "Tables created:" -ForegroundColor Yellow
Write-Host "  - transfers_normalized (3NF compliant)" -ForegroundColor White
Write-Host "  - hospitals_normalized (3NF compliant)" -ForegroundColor White
Write-Host "  - donors_normalized (3NF compliant)" -ForegroundColor White
Write-Host "  - postal_codes (lookup table)" -ForegroundColor White
Write-Host ""
Write-Host "Views created (backward compatibility):" -ForegroundColor Yellow
Write-Host "  - transfers_view" -ForegroundColor White
Write-Host "  - hospitals_view" -ForegroundColor White
Write-Host "  - donors_view" -ForegroundColor White
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Test the normalized tables and views" -ForegroundColor White
Write-Host "2. Update application code to use new structure" -ForegroundColor White
Write-Host "3. Run test-3nf-migration.ps1 to verify everything works" -ForegroundColor White
Write-Host "4. Uncomment Step 5/6 in migration files to activate changes" -ForegroundColor White
Write-Host "5. Restart your application" -ForegroundColor White
Write-Host ""
Write-Host "⚠️  WARNING: Old tables are still active until you uncomment deployment steps!" -ForegroundColor Red
Write-Host ""
