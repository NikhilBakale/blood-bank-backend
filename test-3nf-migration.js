// Test 3NF Migration
// This script tests the normalized database structure using Node.js

require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  user: process.env.SQL_USERNAME,
  password: process.env.SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

async function runTest(pool, testName, query) {
  console.log(`${testName}...`);
  try {
    const result = await pool.request().query(query);
    console.table(result.recordset);
    console.log('✅ Test complete\n');
    return true;
  } catch (error) {
    console.error(`❌ Error: ${error.message}\n`);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('Testing 3NF Database Structure');
  console.log('========================================');
  console.log('');
  
  if (!config.server || !config.database) {
    console.error('❌ Error: SQL_SERVER or SQL_DATABASE not found in .env file');
    process.exit(1);
  }
  
  console.log(`Testing against: ${config.server}/${config.database}`);
  console.log('');
  
  try {
    // Connect to database
    console.log('Connecting to database...');
    const pool = await sql.connect(config);
    console.log('✅ Connected\n');
    
    // Test 1: Check if normalized tables exist
    await runTest(
      pool,
      'Test 1: Checking if normalized tables exist',
      `
      SELECT 'transfers_normalized' as table_name, COUNT(*) as exists 
      FROM sys.tables WHERE name = 'transfers_normalized'
      UNION ALL
      SELECT 'hospitals_normalized', COUNT(*) 
      FROM sys.tables WHERE name = 'hospitals_normalized'
      UNION ALL
      SELECT 'donors_normalized', COUNT(*) 
      FROM sys.tables WHERE name = 'donors_normalized'
      UNION ALL
      SELECT 'postal_codes', COUNT(*) 
      FROM sys.tables WHERE name = 'postal_codes'
      `
    );
    
    // Test 2: Check row counts
    await runTest(
      pool,
      'Test 2: Comparing row counts',
      `
      SELECT 'transfers (old)' as table_name, COUNT(*) as row_count FROM transfers
      UNION ALL
      SELECT 'transfers_normalized', COUNT(*) FROM transfers_normalized
      UNION ALL
      SELECT 'hospitals (old)', COUNT(*) FROM hospitals
      UNION ALL
      SELECT 'hospitals_normalized', COUNT(*) FROM hospitals_normalized
      UNION ALL
      SELECT 'donors (old)', COUNT(*) FROM donors
      UNION ALL
      SELECT 'donors_normalized', COUNT(*) FROM donors_normalized
      UNION ALL
      SELECT 'postal_codes', COUNT(*) FROM postal_codes
      `
    );
    
    // Test 3: Test transfers_view
    await runTest(
      pool,
      'Test 3: Testing transfers_view (top 5)',
      `
      SELECT TOP 5
        transfer_id,
        blood_id,
        donor_id,
        blood_type,
        component_type
      FROM transfers_view
      ORDER BY transfer_id DESC
      `
    );
    
    // Test 4: Test hospitals_view
    await runTest(
      pool,
      'Test 4: Testing hospitals_view (top 5)',
      `
      SELECT TOP 5
        hospital_id,
        name,
        city,
        state,
        postal_code
      FROM hospitals_view
      ORDER BY hospital_id
      `
    );
    
    // Test 5: Test donors_view
    await runTest(
      pool,
      'Test 5: Testing donors_view (top 5)',
      `
      SELECT TOP 5
        donor_id,
        first_name,
        last_name,
        city,
        state,
        postal_code
      FROM donors_view
      ORDER BY donor_id DESC
      `
    );
    
    // Test 6: Verify JOIN performance
    await runTest(
      pool,
      'Test 6: Testing JOIN with donations table (top 5)',
      `
      SELECT TOP 5
        t.transfer_id,
        t.blood_id,
        d.blood_type,
        d.rh_factor,
        d.component_type,
        d.volume_ml,
        d.donor_id
      FROM transfers_normalized t
      LEFT JOIN donations d ON t.blood_id = d.blood_id
      ORDER BY t.transfer_id DESC
      `
    );
    
    // Test 7: Check for data consistency
    await runTest(
      pool,
      'Test 7: Checking data consistency (0 mismatches = good)',
      `
      SELECT 
        'City/State Match' as test,
        COUNT(*) as mismatches
      FROM hospitals h
      JOIN hospitals_normalized hn ON h.hospital_id = hn.hospital_id
      LEFT JOIN postal_codes pc ON hn.postal_code = pc.postal_code
      WHERE h.city != pc.city OR h.state != pc.state
      `
    );
    
    console.log('========================================');
    console.log('Test Summary');
    console.log('========================================');
    console.log('');
    console.log('✅ All tests completed!');
    console.log('');
    console.log('If all tests passed:');
    console.log('1. ✅ Normalized tables have same row counts');
    console.log('2. ✅ Views return data correctly');
    console.log('3. ✅ JOINs work as expected');
    console.log('4. ✅ No data inconsistencies (0 mismatches)');
    console.log('');
    console.log('Next step: Update migration scripts to activate changes');
    console.log('');
    
    await pool.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
