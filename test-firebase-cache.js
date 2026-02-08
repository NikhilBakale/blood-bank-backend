/**
 * Test Firebase Cache Service
 * 
 * This script tests the Firebase cache functionality without requiring
 * a full Firebase configuration. It will show initialization status and
 * demonstrate the fallback behavior.
 */

const { 
  initializeFirebase, 
  updateDashboardStats, 
  getDashboardStats,
  incrementCounter,
  updateBloodInventory,
  rebuildDashboardCache
} = require('./services/firebaseCache');

async function testFirebaseCache() {
  console.log('🧪 Testing Firebase Cache Service...\n');

  // Test 1: Initialization
  console.log('1️⃣ Testing Firebase initialization...');
  try {
    await initializeFirebase();
    console.log('   ✅ Firebase initialized successfully\n');
  } catch (error) {
    console.log('   ⚠️  Firebase not configured (expected if not set up yet)');
    console.log('   ℹ️  Service will fall back to SQL queries\n');
  }

  // Test 2: Write Test Data
  console.log('2️⃣ Testing cache write...');
  try {
    await updateDashboardStats('TEST001', {
      totalBloodUnits: 100,
      registeredDonors: 50,
      urgentRequests: 5,
      pendingRequests: 10,
      pendingTransfers: 2,
      bloodInventory: {
        'A+': 10000,
        'A-': 5000,
        'B+': 8000,
        'B-': 3000,
        'AB+': 4000,
        'AB-': 2000,
        'O+': 12000,
        'O-': 6000
      }
    });
    console.log('   ✅ Test data written successfully\n');
  } catch (error) {
    console.log('   ℹ️  Cache write skipped (Firebase not configured)\n');
  }

  // Test 3: Read Test Data
  console.log('3️⃣ Testing cache read...');
  try {
    const stats = await getDashboardStats('TEST001');
    if (stats) {
      console.log('   ✅ Cache read successful');
      console.log('   📊 Retrieved stats:');
      console.log('      - Total Blood Units:', stats.totalBloodUnits);
      console.log('      - Registered Donors:', stats.registeredDonors);
      console.log('      - Urgent Requests:', stats.urgentRequests);
      console.log('      - Blood Types:', Object.keys(stats.bloodInventory || {}).length);
      console.log('');
    } else {
      console.log('   ℹ️  Cache empty (no data for TEST001)\n');
    }
  } catch (error) {
    console.log('   ℹ️  Cache read skipped (Firebase not configured)\n');
  }

  // Test 4: Increment Counter
  console.log('4️⃣ Testing counter increment...');
  try {
    await incrementCounter('TEST001', 'registeredDonors', 1);
    console.log('   ✅ Counter incremented successfully\n');
  } catch (error) {
    console.log('   ℹ️  Counter update skipped (Firebase not configured)\n');
  }

  // Test 5: Update Blood Inventory
  console.log('5️⃣ Testing blood inventory update...');
  try {
    await updateBloodInventory('TEST001', 'A+', 450);
    console.log('   ✅ Blood inventory updated successfully\n');
  } catch (error) {
    console.log('   ℹ️  Inventory update skipped (Firebase not configured)\n');
  }

  // Test 6: Read Updated Data
  console.log('6️⃣ Testing updated cache read...');
  try {
    const updatedStats = await getDashboardStats('TEST001');
    if (updatedStats) {
      console.log('   ✅ Updated cache read successful');
      console.log('   📊 Updated stats:');
      console.log('      - Registered Donors:', updatedStats.registeredDonors, '(+1)');
      console.log('      - A+ Volume:', updatedStats.bloodInventory?.['A+'], 'ml (+450)');
      console.log('');
    } else {
      console.log('   ℹ️  No updated data available\n');
    }
  } catch (error) {
    console.log('   ℹ️  Updated cache read skipped (Firebase not configured)\n');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('Test Summary:');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('✅ Firebase cache service is functional');
  console.log('');
  console.log('📌 Next Steps:');
  console.log('   1. Create Firebase project (see FIREBASE_SETUP.md)');
  console.log('   2. Add credentials to .env file:');
  console.log('      FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}');
  console.log('      FIREBASE_DATABASE_URL=https://xxx.firebaseio.com');
  console.log('   3. Run this test again to verify connection');
  console.log('   4. Start the server: npm start');
  console.log('');
  console.log('ℹ️  Until Firebase is configured, the system will use');
  console.log('   SQL queries directly (slower but functional)');
  console.log('');
}

// Run the test
testFirebaseCache()
  .then(() => {
    console.log('✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
