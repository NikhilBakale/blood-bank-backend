/**
 * Rebuild Firebase Cache for Single Hospital
 * 
 * Usage: node rebuild-single-cache.js <hospital_id>
 * Example: node rebuild-single-cache.js H001
 */

const { getConnection } = require('./db/sqlConnection');
const { rebuildDashboardCache, initializeFirebase } = require('./services/firebaseCache');

async function rebuildSingleCache(hospitalId) {
  if (!hospitalId) {
    console.error('❌ Error: Hospital ID is required');
    console.log('\nUsage: node rebuild-single-cache.js <hospital_id>');
    console.log('Example: node rebuild-single-cache.js H001');
    process.exit(1);
  }

  console.log(`🔄 Rebuilding Firebase cache for hospital ${hospitalId}...\n`);

  try {
    // Initialize Firebase
    console.log('1️⃣ Initializing Firebase...');
    await initializeFirebase();
    console.log('   ✅ Firebase connected\n');

    // Get database connection
    console.log('2️⃣ Connecting to SQL database...');
    const connection = await getConnection();
    console.log('   ✅ Database connected\n');

    // Verify hospital exists
    console.log('3️⃣ Verifying hospital...');
    const hospitalResult = await connection.request()
      .input('hospital_id', hospitalId)
      .query('SELECT hospital_id, hospital_name FROM hospitals WHERE hospital_id = @hospital_id');

    if (hospitalResult.recordset.length === 0) {
      console.error(`   ❌ Hospital ${hospitalId} not found in database`);
      process.exit(1);
    }

    const hospital = hospitalResult.recordset[0];
    console.log(`   ✅ Found: ${hospital.hospital_name}\n`);

    // Rebuild cache
    console.log('4️⃣ Rebuilding cache...');
    const stats = await rebuildDashboardCache(hospitalId, connection);

    console.log('   ✅ Cache rebuilt successfully!\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Dashboard Statistics:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`🏥 Hospital: ${hospital.hospital_name} (${hospitalId})`);
    console.log(`📦 Total Blood Units: ${stats.totalBloodUnits}`);
    console.log(`👥 Registered Donors: ${stats.registeredDonors}`);
    console.log(`🚨 Urgent Requests: ${stats.urgentRequests}`);
    console.log(`📋 Pending Requests: ${stats.pendingRequests}`);
    console.log(`🚚 Pending Transfers: ${stats.pendingTransfers}`);
    console.log('');
    console.log('Blood Inventory:');
    Object.entries(stats.bloodInventory || {}).forEach(([type, volume]) => {
      console.log(`   ${type}: ${volume} ml`);
    });
    console.log('');
    console.log('🎉 Cache has been rebuilt!');
    console.log('');
    console.log('📊 Verify in Firebase Console:');
    console.log('   https://console.firebase.google.com/');
    console.log(`   Path: hospitals/${hospitalId}/dashboard`);
    console.log('');

  } catch (error) {
    console.error('❌ Error rebuilding cache:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check Firebase credentials in .env file');
    console.error('2. Verify SQL database connection');
    console.error('3. Ensure hospital ID is correct');
    console.error('4. See FIREBASE_SETUP.md for help');
    process.exit(1);
  }
}

// Get hospital ID from command line
const hospitalId = process.argv[2];
rebuildSingleCache(hospitalId)
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
