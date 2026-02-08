require('dotenv').config();
const sql = require('mssql');
const admin = require('firebase-admin');

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

async function fixPendingTransfers() {
  const pool = await sql.connect(config);
  
  try {
    const hospitalId = '0001';
    console.log(`Fixing pending transfers for hospital ${hospitalId}...\n`);
    
    // Get actual count of approved (not fulfilled) requests
    console.log('Counting approved requests (pending transfers)...');
    const result = await pool.request()
      .input('hospital_id', sql.VarChar(10), hospitalId)
      .query(`
        SELECT COUNT(DISTINCT br.request_id) AS pending_transfers_count
        FROM blood_requests br
        INNER JOIN request_hospitals rh ON br.request_id = rh.request_id
        WHERE rh.hospital_id = @hospital_id
          AND rh.status = 'approved'
          AND br.status = 'approved'
      `);
    
    const actualCount = result.recordset[0].pending_transfers_count;
    console.log(`Actual pending transfers: ${actualCount}\n`);
    
    // Initialize Firebase
    console.log('Connecting to Firebase...');
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    
    const db = admin.firestore();
    const docRef = db.collection('dashboardStats').doc(hospitalId);
    
    // Get current cached value
    const doc = await docRef.get();
    if (doc.exists) {
      const cachedValue = doc.data().pendingTransfers;
      console.log(`Current cached value: ${cachedValue}`);
    } else {
      console.log('No cached data found');
    }
    
    // Update with correct value
    console.log(`Updating to correct value: ${actualCount}...`);
    await docRef.set({
      pendingTransfers: actualCount,
      lastUpdated: Date.now()
    }, { merge: true });
    
    console.log('\n✅ Pending transfers fixed!');
    console.log(`Set to: ${actualCount}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await pool.close();
  }
}

fixPendingTransfers();
