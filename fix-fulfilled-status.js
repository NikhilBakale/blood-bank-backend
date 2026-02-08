require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  authentication: {
    type: 'azure-active-directory-default'
  },
  options: {
    encrypt: true
  }
};

(async () => {
  try {
    const pool = await sql.connect(config);
    console.log('Connected to database\n');
    
    console.log('Checking current request statuses...');
    const result = await pool.request().query(`
      SELECT 
        br.request_id, 
        br.patient_name, 
        br.status as main_status, 
        rh.hospital_id, 
        rh.status as hospital_status 
      FROM blood_requests br 
      LEFT JOIN request_hospitals rh ON br.request_id = rh.request_id 
      ORDER BY br.created_at DESC
    `);
    
    console.log('Current status of all requests:');
    console.log(JSON.stringify(result.recordset, null, 2));
    console.log('');
    
    console.log('Updating blood_requests where request_hospitals.status = fulfilled...');
    const update = await pool.request().query(`
      UPDATE blood_requests 
      SET status = 'fulfilled' 
      WHERE request_id IN (
        SELECT DISTINCT request_id 
        FROM request_hospitals 
        WHERE status = 'fulfilled'
      )
    `);
    
    console.log(`✓ Updated ${update.rowsAffected[0]} request(s) to fulfilled status\n`);
    
    // Verify the update
    console.log('Verifying updated statuses...');
    const verifyResult = await pool.request().query(`
      SELECT 
        br.request_id, 
        br.patient_name, 
        br.status as main_status, 
        rh.hospital_id, 
        rh.status as hospital_status 
      FROM blood_requests br 
      LEFT JOIN request_hospitals rh ON br.request_id = rh.request_id 
      ORDER BY br.created_at DESC
    `);
    
    console.log('After update:');
    console.log(JSON.stringify(verifyResult.recordset, null, 2));
    
    await pool.close();
    console.log('\n✓ Done!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
