require('dotenv').config();
const sql = require('mssql');

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
  }
};

(async () => {
  try {
    console.log('Connecting to database...');
    const pool = await sql.connect(config);
    console.log('Connected!\n');
    
    console.log('Updating blood_requests status to fulfilled...');
    const result = await pool.request().query(`
      UPDATE blood_requests 
      SET status = 'fulfilled' 
      WHERE request_id IN (
        SELECT DISTINCT request_id 
        FROM request_hospitals 
        WHERE status = 'fulfilled'
      )
    `);
    
    console.log(`Updated ${result.rowsAffected[0]} record(s)\n`);
    
    console.log('Verifying...');
    const verify = await pool.request().query(`
      SELECT 
        br.request_id, 
        br.patient_name, 
        br.status 
      FROM blood_requests br 
      WHERE br.status = 'fulfilled'
    `);
    
    console.log('Fulfilled requests:');
    verify.recordset.forEach(r => {
      console.log(`  - ${r.patient_name}: ${r.status}`);
    });
    
    await pool.close();
    console.log('\nDone!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
