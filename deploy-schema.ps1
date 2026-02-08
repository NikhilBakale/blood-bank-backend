# SQL Schema Deployment Script for Azure SQL
# This script creates the donors and donations tables in your Azure SQL database

# Install SqlServer module if not present
if (-not (Get-Module -ListAvailable -Name SqlServer)) {
    Write-Host "Installing SqlServer PowerShell module..."
    Install-Module -Name SqlServer -Force -AllowClobber
}

# Connection parameters
$serverName = "bloodinventory.database.windows.net"
$databaseName = "BloodInventory"
$serverFqdn = "$serverName"

Write-Host "Connecting to Azure SQL Server: $serverName" -ForegroundColor Cyan
Write-Host "Database: $databaseName" -ForegroundColor Cyan

try {
    # Read SQL schema from file
    $schemaPath = Join-Path $PSScriptRoot "sql\schema.sql"
    if (-not (Test-Path $schemaPath)) {
        Write-Host "ERROR: SQL schema file not found at $schemaPath" -ForegroundColor Red
        exit 1
    }

    $sqlScript = Get-Content -Path $schemaPath -Raw

    # Execute the schema script
    Write-Host "`nExecuting SQL schema..." -ForegroundColor Yellow
    Invoke-Sqlcmd -ServerName $serverFqdn -Database $databaseName -InputFile $schemaPath -Verbose

    Write-Host "`n✅ Schema deployed successfully!" -ForegroundColor Green
    Write-Host "Tables created: donors, donations" -ForegroundColor Green
    Write-Host "Views created: available_blood_inventory, donor_donation_history" -ForegroundColor Green

} catch {
    Write-Host "❌ Error deploying schema:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host "`nDeployment complete!" -ForegroundColor Green
