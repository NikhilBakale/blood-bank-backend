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
    
    console.log('🗑️  Clearing donation records...');
    await pool.request().query('DELETE FROM donations');
    
    console.log('🗑️  Clearing donor records...');
    await pool.request().query('DELETE FROM donors');
    
    // Reset identity
    await pool.request().query('DBCC CHECKIDENT (donors, RESEED, 0)');
    
    console.log('✅ All donors and donations cleared!');
    
    // Verify
    const donorsResult = await pool.request().query('SELECT COUNT(*) as count FROM donors');
    const donationsResult = await pool.request().query('SELECT COUNT(*) as count FROM donations');
    
    console.log('Donors remaining:', donorsResult.recordset[0].count);
    console.log('Donations remaining:', donationsResult.recordset[0].count);
    
    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
