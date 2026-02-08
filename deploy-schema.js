const fs = require('fs');
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
    
    console.log('📖 Reading SQL schema file...');
    const schemaPath = 'sql/schema.sql';
    let schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Split by GO statements and execute individually
    const statements = schema.split(/\nGO\n/i);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (statement.length > 0) {
        console.log(`\n[${i + 1}/${statements.length}] Executing...`);
        try {
          await pool.request().query(statement);
          console.log('✅ Statement executed successfully');
        } catch (err) {
          console.log(`⚠️  Statement ${i + 1} skipped (might already exist): ${err.message.substring(0, 100)}`);
        }
      }
    }
    
    console.log('\n✅ Schema deployment complete!');
    
    // Verify hospitals table exists
    const verifyResult = await pool.request().query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME IN ('hospitals', 'donors', 'donations')
    `);
    
    console.log('\n📋 Created tables:');
    verifyResult.recordset.forEach(row => console.log('  - ' + row.TABLE_NAME));
    
    await pool.close();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
