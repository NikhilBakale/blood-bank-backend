require("dotenv").config();
const sql = require("mssql");

const config = {
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  authentication: process.env.SQL_USERNAME && process.env.SQL_PASSWORD 
    ? {
        type: "default",
        options: {
          userName: process.env.SQL_USERNAME,
          password: process.env.SQL_PASSWORD,
        }
      }
    : {
        type: "azure-active-directory-default",
      },
  options: {
    encrypt: true,
    trustServerCertificate: false,
    connectionTimeout: 60000,
    requestTimeout: 60000,
    integratedSecurity: false,
  },
};

console.log("🔧 Testing SQL Connection...");
console.log("Server:", config.server);
console.log("Database:", config.database);
console.log("Auth Type:", config.authentication.type);

async function testConnection() {
  try {
    const pool = new sql.ConnectionPool(config);
    console.log("\n⏳ Attempting to connect...");
    
    await pool.connect();
    console.log("✅ CONNECTION SUCCESSFUL!");
    
    // Test query
    console.log("\n⏳ Running test query...");
    const result = await pool.request().query("SELECT 1 as test");
    console.log("✅ QUERY SUCCESSFUL!");
    console.log("Result:", result.recordset);
    
    // List tables
    console.log("\n⏳ Checking tables...");
    const tables = await pool.request().query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'
    `);
    console.log("✅ TABLES FOUND:");
    tables.recordset.forEach(t => console.log("  -", t.TABLE_NAME));
    
    await pool.close();
    console.log("\n✅ Connection closed successfully");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    console.error("\nDetails:");
    console.error("- Server:", config.server);
    console.error("- Port: 1433");
    console.error("- Username:", process.env.SQL_USERNAME || "AAD");
    console.error("\nPossible causes:");
    console.error("1. Port 1433 is blocked by firewall/ISP");
    console.error("2. SQL server is unreachable from your network");
    console.error("3. Incorrect username/password");
    console.error("4. Azure SQL server is down");
    process.exit(1);
  }
}

testConnection();
