@echo off
REM Azure Backend Deployment Script for Windows

echo ================================================
echo Blood Bank Buddy - Azure Backend Deployment
echo ================================================
echo.

REM Check Azure CLI
where az >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Azure CLI is not installed
    echo Install from: https://aka.ms/installazurecli
    exit /b 1
)
echo [OK] Azure CLI found

REM Check login
az account show >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] Logging in to Azure...
    az login
)
echo [OK] Logged in to Azure

echo.
echo Please provide deployment details:
echo.

set /p RESOURCE_GROUP="Resource Group name: "
set /p APP_NAME="App name (e.g., blood-bank-api): "
set /p LOCATION="Location (e.g., eastus): "
set /p SKU="Pricing tier (F1 or B1): "

REM Check if resource group exists
az group show --name "%RESOURCE_GROUP%" >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] Creating resource group...
    az group create --name "%RESOURCE_GROUP%" --location "%LOCATION%"
)
echo [OK] Resource group ready

echo.
echo [INFO] Deploying backend to Azure...
echo.

cd server

az webapp up ^
    --resource-group "%RESOURCE_GROUP%" ^
    --name "%APP_NAME%" ^
    --runtime "NODE:20-lts" ^
    --sku "%SKU%" ^
    --location "%LOCATION%" ^
    --os-type Linux

echo.
echo [SUCCESS] Backend deployed!
echo.
echo Your backend URL: https://%APP_NAME%.azurewebsites.net
echo.
echo Next steps:
echo 1. Add environment variables in Azure Portal
echo 2. Test: https://%APP_NAME%.azurewebsites.net/api/health
echo 3. Update frontend .env.local with backend URL
echo.

pause
