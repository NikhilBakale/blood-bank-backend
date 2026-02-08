const sql = require('mssql');
require('dotenv').config();

const config = {
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  authentication: {
    type: 'default',
    options: {
      userName: process.env.SQL_USERNAME,
      password: process.env.SQL_PASSWORD,
    }
  },
  options: {
    encrypt: true,
    trustServerCertificate: false,
  }
};

(async () => {
  try {
    const pool = new sql.ConnectionPool(config);
    await pool.connect();
    
    // Try a simple select to see what columns exist
    const result = await pool.request().query(`SELECT TOP 1 * FROM hospitals`);
    
    console.log('Hospitals table structure (from SELECT *):', Object.keys(result.recordset[0] || {}));
    
    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
