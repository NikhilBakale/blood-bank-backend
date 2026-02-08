// Fix incorrect Firebase cache values for pending requests and transfers
const { getConnection } = require('./config/database');
const sql = require('mssql');
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = require('./firebase-service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://blood-bank-buddy-default-rtdb.firebaseio.com'
  });
}

const db = admin.firestore();

async function fixCacheValues() {
  try {
    console.log('===================================');
    console.log('Fixing Firebase Cache Values');
    console.log('===================================\n');

    const connection = await getConnection();

    // Get all hospitals
    const hospitalsResult = await connection.request().query(`
      SELECT hospital_id, hospital_name FROM hospitals
    `);

    for (const hospital of hospitalsResult.recordset) {
      const hospitalId = hospital.hospital_id;
      console.log(`\n🏥 Processing: ${hospital.hospital_name} (${hospitalId})`);
      console.log('─'.repeat(50));

      // Get actual pending requests count
      const pendingRequest = connection.request();
      pendingRequest.input("hospital_id", sql.VarChar(10), hospitalId);
      const pendingResult = await pendingRequest.query(`
        SELECT COUNT(DISTINCT br.request_id) AS pending_count
        FROM blood_requests br
        INNER JOIN request_hospitals rh ON br.request_id = rh.request_id
        WHERE rh.hospital_id = @hospital_id
          AND rh.status = 'pending'
      `);
      const actualPendingRequests = pendingResult.recordset[0].pending_count || 0;

      // Get actual pending transfers count (approved but not fulfilled)
      const transfersRequest = connection.request();
      transfersRequest.input("hospital_id", sql.VarChar(10), hospitalId);
      const transfersResult = await transfersRequest.query(`
        SELECT COUNT(DISTINCT br.request_id) AS pending_transfers_count
        FROM blood_requests br
        INNER JOIN request_hospitals rh ON br.request_id = rh.request_id
        WHERE rh.hospital_id = @hospital_id
          AND rh.status = 'approved'
      `);
      const actualPendingTransfers = transfersResult.recordset[0].pending_transfers_count || 0;

      // Get cached values
      const cacheDoc = await db.collection('dashboard_stats').doc(hospitalId).get();
      const cachedData = cacheDoc.exists ? cacheDoc.data() : null;

      console.log('\n📊 Comparison:');
      console.log(`   Pending Requests:`);
      console.log(`      SQL Actual: ${actualPendingRequests}`);
      console.log(`      Cache Value: ${cachedData?.pendingRequests ?? 'N/A'}`);
      
      console.log(`   Pending Transfers:`);
      console.log(`      SQL Actual: ${actualPendingTransfers}`);
      console.log(`      Cache Value: ${cachedData?.pendingTransfers ?? 'N/A'}`);

      // Check if update is needed
      const needsUpdate = 
        !cachedData || 
        cachedData.pendingRequests !== actualPendingRequests ||
        cachedData.pendingTransfers !== actualPendingTransfers;

      if (needsUpdate) {
        console.log('\n⚠️  Mismatch detected! Updating cache...');
        
        // Update Firebase cache
        await db.collection('dashboard_stats').doc(hospitalId).set({
          pendingRequests: actualPendingRequests,
          pendingTransfers: actualPendingTransfers,
          lastUpdated: Date.now()
        }, { merge: true });

        console.log('✅ Cache updated successfully!');
      } else {
        console.log('\n✓ Cache is accurate, no update needed');
      }
    }

    console.log('\n===================================');
    console.log('Cache Fix Complete!');
    console.log('===================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Error fixing cache values:', error);
    process.exit(1);
  }
}

fixCacheValues();
