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
    
    console.log('=== Checking Pending Transfers ===\n');
    
    // Check for hospital 0001 (RV Hospital from screenshot)
    const hospital_id = '0001';
    
    console.log(`Hospital ID: ${hospital_id}\n`);
    
    // Query from firebaseCache.js logic
    const result = await pool.request()
      .input('hospital_id', sql.VarChar(10), hospital_id)
      .query(`
        SELECT COUNT(DISTINCT br.request_id) AS pending_transfers_count
        FROM blood_requests br
        INNER JOIN request_hospitals rh ON br.request_id = rh.request_id
        WHERE rh.hospital_id = @hospital_id
          AND rh.status = 'approved'
      `);
    
    console.log('Approved requests (pending transfers):', result.recordset[0].pending_transfers_count);
    
    // Check all request statuses for this hospital
    console.log('\nAll requests for this hospital:');
    const allRequests = await pool.request()
      .input('hospital_id', sql.VarChar(10), hospital_id)
      .query(`
        SELECT br.request_id, br.patient_name, br.status as request_status, rh.status as hospital_status
        FROM blood_requests br
        INNER JOIN request_hospitals rh ON br.request_id = rh.request_id
        WHERE rh.hospital_id = @hospital_id
        ORDER BY br.created_at DESC
      `);
    
    allRequests.recordset.forEach(r => {
      console.log(`  - ${r.patient_name}: request_status=${r.request_status}, hospital_status=${r.hospital_status}`);
    });
    
    // Check Firebase cache
    console.log('\nChecking Firebase cache...');
    const { getDashboardStats } = require('./services/firebaseCache');
    const cachedStats = await getDashboardStats(hospital_id);
    
    if (cachedStats) {
      console.log('Firebase cached value:', cachedStats.pendingTransfers);
      console.log('Last updated:', new Date(cachedStats.lastUpdated).toLocaleString());
    } else {
      console.log('No Firebase cache found');
    }
    
    await pool.close();
    
    console.log('\n=== Analysis ===');
    console.log('Expected pending transfers:', result.recordset[0].pending_transfers_count);
    console.log('Cached pending transfers:', cachedStats?.pendingTransfers);
    
    if (cachedStats?.pendingTransfers < 0) {
      console.log('\n❌ ISSUE: Cached value is negative!');
      console.log('💡 Solution: Rebuild the cache to fix this');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
})();
