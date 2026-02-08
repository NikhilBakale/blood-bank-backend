require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  authentication: {
    type: "default",
    options: {
      userName: process.env.SQL_USERNAME,
      password: process.env.SQL_PASSWORD,
    }
  },
  options: {
    encrypt: true,
  }
};

(async () => {
  try {
    const pool = await sql.connect(config);
    
    console.log('Checking tables...\n');
    
    const tables = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE' 
        AND (TABLE_NAME LIKE '%donor%' OR TABLE_NAME LIKE '%hospital%')
      ORDER BY TABLE_NAME
    `);
    
    console.log('Donor/Hospital tables:');
    tables.recordset.forEach(t => console.log('  -', t.TABLE_NAME));
    
    console.log('\nChecking donors table columns...');
    const donorCols = await pool.request().query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'donors'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('Donors columns:');
    donorCols.recordset.forEach(c => console.log('  -', c.COLUMN_NAME));
    
    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
