/**
 * Rebuild Firebase Cache for All Hospitals
 * 
 * This script rebuilds the Firebase cache for all hospitals that have data
 * in the SQL database. Useful for:
 * - Initial Firebase setup (populate cache for existing hospitals)
 * - After data migration
 * - If cache becomes corrupted
 * - Periodic cache refresh
 */

const { getConnection } = require('./db/sqlConnection');
const { rebuildDashboardCache, initializeFirebase } = require('./services/firebaseCache');

async function rebuildAllCaches() {
  console.log('🔄 Rebuilding Firebase cache for all hospitals...\n');

  try {
    // Initialize Firebase
    console.log('1️⃣ Initializing Firebase...');
    await initializeFirebase();
    console.log('   ✅ Firebase connected\n');

    // Get database connection
    console.log('2️⃣ Connecting to SQL database...');
    const connection = await getConnection();
    console.log('   ✅ Database connected\n');

    // Get all hospital IDs that have data
    console.log('3️⃣ Finding hospitals with data...');
    const result = await connection.request().query(`
      SELECT DISTINCT hospital_id, hospital_name
      FROM hospitals
      WHERE hospital_id IN (
        SELECT DISTINCT hospital_id FROM donors
        UNION
        SELECT DISTINCT hospital_id FROM donations
        UNION
        SELECT DISTINCT hospital_id FROM transfers
      )
      ORDER BY hospital_id
    `);

    const hospitals = result.recordset;
    console.log(`   ✅ Found ${hospitals.length} hospitals with data\n`);

    if (hospitals.length === 0) {
      console.log('   ℹ️  No hospitals with data found. Nothing to rebuild.\n');
      return;
    }

    // Rebuild cache for each hospital
    console.log('4️⃣ Rebuilding caches...\n');
    let successCount = 0;
    let failCount = 0;

    for (const hospital of hospitals) {
      try {
        console.log(`   🏥 ${hospital.hospital_id} - ${hospital.hospital_name}`);
        
        const stats = await rebuildDashboardCache(hospital.hospital_id, connection);
        
        console.log(`      ✅ Cache rebuilt successfully`);
        console.log(`         - Blood Units: ${stats.totalBloodUnits}`);
        console.log(`         - Donors: ${stats.registeredDonors}`);
        console.log(`         - Pending Requests: ${stats.pendingRequests}`);
        console.log(`         - Urgent Requests: ${stats.urgentRequests}`);
        console.log('');
        
        successCount++;
      } catch (error) {
        console.error(`      ❌ Failed to rebuild cache: ${error.message}\n`);
        failCount++;
      }
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('Rebuild Summary:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`✅ Successfully rebuilt: ${successCount} hospitals`);
    if (failCount > 0) {
      console.log(`❌ Failed: ${failCount} hospitals`);
    }
    console.log('');
    console.log('🎉 All caches have been rebuilt!');
    console.log('');
    console.log('📊 You can verify the data in Firebase Console:');
    console.log('   https://console.firebase.google.com/');
    console.log('   Navigate to: Realtime Database > Data > hospitals');
    console.log('');

  } catch (error) {
    console.error('❌ Error rebuilding caches:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check Firebase credentials in .env file');
    console.error('2. Verify SQL database connection');
    console.error('3. See FIREBASE_SETUP.md for configuration help');
    process.exit(1);
  }
}

// Run the rebuild
rebuildAllCaches()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
