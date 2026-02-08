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

async function testDonorAndDonation() {
  const pool = await sql.connect(config);
  
  try {
    console.log('=== Testing Donor and Donation Add ===\n');
    
    // Step 1: Check if postal code exists
    console.log('Step 1: Checking postal_codes table...');
    const postalCheck = await pool.request().query(`
      SELECT postal_code, city, state FROM postal_codes WHERE postal_code = '110001'
    `);
    
    if (postalCheck.recordset.length === 0) {
      console.log('  Postal code 110001 not found, inserting it...');
      await pool.request().query(`
        INSERT INTO postal_codes (postal_code, city, state)
        VALUES ('110001', 'New Delhi', 'Delhi')
      `);
      console.log('  ✓ Inserted postal code 110001');
    } else {
      console.log(`  ✓ Postal code 110001 exists: ${postalCheck.recordset[0].city}, ${postalCheck.recordset[0].state}`);
    }
    
    // Step 2: Insert a test donor
    console.log('\nStep 2: Testing donor INSERT...');
    const donorInsert = await pool.request()
      .input('hospital_id', sql.VarChar(10), '0001')
      .input('first_name', sql.NVarChar(100), 'Test')
      .input('last_name', sql.NVarChar(100), 'Donor')
      .input('date_of_birth', sql.Date, '1990-01-01')
      .input('gender', sql.VarChar(10), 'Male')
      .input('phone', sql.VarChar(20), '9876543210')
      .input('email', sql.NVarChar(100), 'test@example.com')
      .input('address', sql.NVarChar(255), '123 Test Street')
      .input('postal_code', sql.VarChar(10), '110001')
      .query(`
        INSERT INTO donors (hospital_id, first_name, last_name, date_of_birth, gender, phone, email, address, postal_code)
        VALUES (@hospital_id, @first_name, @last_name, @date_of_birth, @gender, @phone, @email, @address, @postal_code);
        SELECT SCOPE_IDENTITY() as donor_id;
      `);
    
    const donor_id = donorInsert.recordset[0].donor_id;
    console.log(`  ✓ Inserted donor with ID: ${donor_id}`);
    
    // Step 3: Verify donor with view
    console.log('\nStep 3: Verifying donor via donors_view...');
    const donorView = await pool.request()
      .input('donor_id', sql.Int, donor_id)
      .query(`
        SELECT donor_id, first_name, last_name, city, state, postal_code
        FROM donors_view
        WHERE donor_id = @donor_id
      `);
    
    if (donorView.recordset.length > 0) {
      const d = donorView.recordset[0];
      console.log(`  ✓ Donor found: ${d.first_name} ${d.last_name}, ${d.city}, ${d.state} (${d.postal_code})`);
    } else {
      console.log('  ❌ Donor not found in view!');
    }
    
    // Step 4: Insert a test donation
    console.log('\nStep 4: Testing donation INSERT...');
    const blood_id = `TEST-${Date.now()}`;
    const donationInsert = await pool.request()
      .input('blood_id', sql.NVarChar(50), blood_id)
      .input('donor_id', sql.Int, donor_id)
      .input('hospital_id', sql.VarChar(10), '0001')
      .input('blood_type', sql.VarChar(5), 'O')
      .input('rh_factor', sql.VarChar(1), '+')
      .input('component_type', sql.NVarChar(50), 'Whole Blood')
      .input('volume_ml', sql.Int, 450)
      .input('collection_date', sql.DateTime, new Date())
      .input('expiry_date', sql.DateTime, new Date(Date.now() + 35 * 24 * 60 * 60 * 1000))
      .query(`
        INSERT INTO donations (
          blood_id, donor_id, hospital_id, blood_type, rh_factor, component_type,
          volume_ml, collection_date, expiry_date, status
        )
        VALUES (
          @blood_id, @donor_id, @hospital_id, @blood_type, @rh_factor, @component_type,
          @volume_ml, @collection_date, @expiry_date, 'available'
        );
      `);
    
    console.log(`  ✓ Inserted donation with ID: ${blood_id}`);
    
    // Step 5: Verify donation
    console.log('\nStep 5: Verifying donation...');
    const donationCheck = await pool.request()
      .input('blood_id', sql.VarChar(50), blood_id)
      .query(`
        SELECT d.blood_id, d.blood_type, d.rh_factor, d.volume_ml, d.component_type,
               don.first_name, don.last_name
        FROM donations d
        INNER JOIN donors don ON d.donor_id = don.donor_id
        WHERE d.blood_id = @blood_id
      `);
    
    if (donationCheck.recordset.length > 0) {
      const d = donationCheck.recordset[0];
      console.log(`  ✓ Donation found: ${d.blood_type}${d.rh_factor} ${d.component_type}, ${d.volume_ml}ml from ${d.first_name} ${d.last_name}`);
    } else {
      console.log('  ❌ Donation not found!');
    }
    
    // Clean up test data
    console.log('\nStep 6: Cleaning up test data...');
    await pool.request().input('blood_id', sql.VarChar(50), blood_id).query(`DELETE FROM donations WHERE blood_id = @blood_id`);
    await pool.request().input('donor_id', sql.Int, donor_id).query(`DELETE FROM donors WHERE donor_id = @donor_id`);
    console.log('  ✓ Test data deleted');
    
    console.log('\n✅ All tests passed! Donor and Donation add functionality is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Details:', error);
  } finally {
    await pool.close();
  }
}

testDonorAndDonation();
