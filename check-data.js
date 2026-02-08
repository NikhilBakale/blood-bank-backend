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
    
    // Check hospitals table
    const hospitalsResult = await pool.request().query(`
      SELECT * FROM hospitals
    `);
    
    console.log('Hospitals in SQL:', hospitalsResult.recordset);
    
    // Check donors table structure
    const donorsResult = await pool.request().query(`
      SELECT TOP 5 * FROM donors
    `);
    
    console.log('Sample donors:', donorsResult.recordset);
    
    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
