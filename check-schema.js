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
    
    // Check current schema
    const result = await pool.request().query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = 'dbo'
    `);
    
    console.log('Tables in database:', result.recordset);
    
    // Check donors table constraints
    const constraintsResult = await pool.request().query(`
      SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
      WHERE TABLE_NAME = 'donors'
    `);
    
    console.log('Donors table constraints:', constraintsResult.recordset);
    
    // Check foreign key constraints
    const fkResult = await pool.request().query(`
      SELECT * FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS 
      WHERE TABLE_NAME = 'donors'
    `);
    
    console.log('Foreign key constraints:', fkResult.recordset);
    
    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
