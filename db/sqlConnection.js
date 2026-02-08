const sql = require("mssql");

// Support both AAD and SQL Auth - fallback gracefully
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
  pool: {
    min: 0,
    max: parseInt(process.env.SQL_POOL_SIZE) || 10,
    idleTimeoutMillis: 60000,
  },
};

let pool = null;

async function getConnection() {
  if (!pool) {
    try {
      pool = new sql.ConnectionPool(config);
      await pool.connect();
      console.log("✅ Azure SQL Server connected successfully via AAD");
    } catch (error) {
      console.error("❌ Azure SQL connection failed:", error.message);
      throw error;
    }
  }
  return pool;
}

async function closeConnection() {
  if (pool) {
    try {
      await pool.close();
      console.log("✅ Azure SQL connection closed");
    } catch (error) {
      console.error("❌ Error closing connection:", error);
    }
  }
}

async function executeQuery(query, params = {}) {
  const connection = await getConnection();
  try {
    const request = connection.request();

    // Add parameters
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }

    const result = await request.query(query);
    return result;
  } catch (error) {
    console.error("Query execution error:", error);
    throw error;
  }
}

module.exports = {
  getConnection,
  closeConnection,
  executeQuery,
  sql,
};
