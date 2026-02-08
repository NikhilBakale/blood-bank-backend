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
    
    console.log('\n=== TRANSFERS TABLE ===');
    const transfersResult = await pool.request().query(`
      SELECT TOP 5 * FROM transfers ORDER BY created_at DESC
    `);
    console.log('Transfers:', JSON.stringify(transfersResult.recordset, null, 2));
    
    console.log('\n=== DONATIONS FOR THOSE BLOOD IDs ===');
    if (transfersResult.recordset.length > 0) {
      const bloodIds = transfersResult.recordset.map(t => `'${t.blood_id}'`).join(',');
      const donationsResult = await pool.request().query(`
        SELECT * FROM donations WHERE blood_id IN (${bloodIds})
      `);
      console.log('Donations:', JSON.stringify(donationsResult.recordset, null, 2));
    }
    
    console.log('\n=== TRANSFERS_VIEW ===');
    const viewResult = await pool.request().query(`
      SELECT TOP 5 * FROM transfers_view ORDER BY created_at DESC
    `);
    console.log('Transfers View:', JSON.stringify(viewResult.recordset, null, 2));
    
    await pool.close();
  } catch (err) {
    console.error('Error:', err);
  }
})();
