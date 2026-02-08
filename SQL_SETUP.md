# Azure SQL Setup Instructions

## Prerequisites
You need to run the SQL schema on your Azure SQL database to create the `donors` and `donations` tables.

### Option 1: Using Azure Portal (Web UI)
1. Go to https://portal.azure.com
2. Search for "BloodInventory" SQL database
3. Click on **Query editor (preview)**
4. Copy-paste the entire content of `server/sql/schema.sql`
5. Click **Run**
6. Tables will be created automatically

### Option 2: Using PowerShell (Recommended)
```powershell
cd "g:\Blood Inventory management\blood-bank-buddy\server"
.\deploy-schema.ps1
```

### Option 3: Using Azure SQL Management Studio
1. Download SQL Server Management Studio
2. Connect to: `bloodinventory.database.windows.net`
3. Open `server/sql/schema.sql`
4. Execute the script

## Important Notes
- **AAD Authentication**: Your Azure SQL is configured with Azure Active Directory (AAD)
- **No Password Needed**: The backend will authenticate using your Azure credentials
- **Firewall Rules**: Make sure your IP is allowed in the SQL firewall (usually auto-configured)

## After Schema is Created
Once tables are created, restart the backend:
```powershell
cd "g:\Blood Inventory management\blood-bank-buddy\server"
npm start
```

The API will then be ready to:
- POST /api/donors — Create a new donor
- POST /api/donations — Record a blood donation
- GET /api/donors?hospital_id=0001 — List donors
- GET /api/donations?hospital_id=0001 — List donations
