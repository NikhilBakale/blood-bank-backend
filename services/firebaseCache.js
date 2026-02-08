const admin = require('firebase-admin');

// Initialize Firebase Admin
let firebaseInitialized = false;
let db = null;

function initializeFirebase() {
  if (firebaseInitialized) return db;

  try {
    // Check if service account key exists
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
      
      db = admin.database();
      firebaseInitialized = true;
      console.log('✅ Firebase Realtime Database connected');
    } else {
      console.warn('⚠️  Firebase not configured - dashboard will use SQL only');
    }
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error.message);
    console.warn('⚠️  Dashboard will use SQL fallback');
  }

  return db;
}

// Update dashboard stats for a hospital
async function updateDashboardStats(hospitalId, stats) {
  try {
    const database = initializeFirebase();
    if (!database) return false;

    const ref = database.ref(`hospitals/${hospitalId}/dashboard`);
    await ref.update({
      ...stats,
      lastUpdated: Date.now()
    });
    
    return true;
  } catch (error) {
    console.error('Firebase cache update error:', error.message);
    return false;
  }
}

// Get dashboard stats for a hospital
async function getDashboardStats(hospitalId) {
  try {
    const database = initializeFirebase();
    if (!database) return null;

    const ref = database.ref(`hospitals/${hospitalId}/dashboard`);
    const snapshot = await ref.once('value');
    
    return snapshot.val();
  } catch (error) {
    console.error('Firebase cache read error:', error.message);
    return null;
  }
}

// Increment a counter (for quick updates)
async function incrementCounter(hospitalId, counterName, amount = 1) {
  try {
    const database = initializeFirebase();
    if (!database) return false;

    const ref = database.ref(`hospitals/${hospitalId}/dashboard/${counterName}`);
    const snapshot = await ref.once('value');
    const currentValue = snapshot.val() || 0;
    
    await ref.set(currentValue + amount);
    await database.ref(`hospitals/${hospitalId}/dashboard/lastUpdated`).set(Date.now());
    
    return true;
  } catch (error) {
    console.error('Firebase counter increment error:', error.message);
    return false;
  }
}

// Update blood inventory for a specific blood type
async function updateBloodInventory(hospitalId, bloodType, volumeDelta) {
  try {
    const database = initializeFirebase();
    if (!database) return false;

    const ref = database.ref(`hospitals/${hospitalId}/dashboard/bloodInventory/${bloodType}`);
    
    // Get current value and increment/decrement
    const snapshot = await ref.once('value');
    const currentVolume = snapshot.val() || 0;
    const newVolume = Math.max(0, currentVolume + volumeDelta); // Prevent negative values
    
    await ref.set(newVolume);
    await database.ref(`hospitals/${hospitalId}/dashboard/lastUpdated`).set(Date.now());
    
    console.log(`📊 Blood inventory updated: ${hospitalId} ${bloodType}: ${currentVolume} + ${volumeDelta} = ${newVolume}`);
    return true;
  } catch (error) {
    console.error('Firebase blood inventory update error:', error.message);
    return false;
  }
}

// Rebuild entire dashboard cache from SQL (use when initializing or recovering)
async function rebuildDashboardCache(hospitalId, connection) {
  try {
    const sql = require('mssql');
    const request = connection.request();
    request.input("hospital_id", sql.VarChar(10), hospitalId);

    // Get blood inventory
    const inventoryResult = await request.query(`
      SELECT 
        blood_type,
        rh_factor,
        SUM(volume_ml) AS total_volume,
        COUNT(*) AS unit_count
      FROM donations
      WHERE hospital_id = @hospital_id 
        AND status = 'available'
        AND expiry_date > GETDATE()
      GROUP BY blood_type, rh_factor
    `);

    // Build blood inventory object
    const bloodInventory = {};
    let totalBloodUnits = 0;
    
    inventoryResult.recordset.forEach(row => {
      const key = `${row.blood_type}${row.rh_factor}`;
      bloodInventory[key] = row.total_volume || 0;
      totalBloodUnits += row.unit_count || 0;
    });

    // Ensure all blood types exist
    const allTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    allTypes.forEach(type => {
      if (!bloodInventory[type]) {
        bloodInventory[type] = 0;
      }
    });

    // Get donor count
    const donorRequest = connection.request();
    donorRequest.input("hospital_id", sql.VarChar(10), hospitalId);
    const donorResult = await donorRequest.query(`
      SELECT COUNT(*) AS total_donors
      FROM donors
      WHERE hospital_id = @hospital_id
    `);

    // Get urgent requests count
    const urgentRequest = connection.request();
    urgentRequest.input("hospital_id", sql.VarChar(10), hospitalId);
    const urgentResult = await urgentRequest.query(`
      SELECT COUNT(DISTINCT br.request_id) AS urgent_count
      FROM blood_requests br
      INNER JOIN request_hospitals rh ON br.request_id = rh.request_id
      WHERE rh.hospital_id = @hospital_id
        AND br.urgency IN ('critical', 'urgent')
        AND rh.status = 'pending'
    `);

    // Get pending requests count
    const pendingRequest = connection.request();
    pendingRequest.input("hospital_id", sql.VarChar(10), hospitalId);
    const pendingResult = await pendingRequest.query(`
      SELECT COUNT(DISTINCT br.request_id) AS pending_count
      FROM blood_requests br
      INNER JOIN request_hospitals rh ON br.request_id = rh.request_id
      WHERE rh.hospital_id = @hospital_id
        AND rh.status = 'pending'
    `);

    // Get pending transfers count
    const transfersRequest = connection.request();
    transfersRequest.input("hospital_id", sql.VarChar(10), hospitalId);
    const transfersResult = await transfersRequest.query(`
      SELECT COUNT(DISTINCT br.request_id) AS pending_transfers_count
      FROM blood_requests br
      INNER JOIN request_hospitals rh ON br.request_id = rh.request_id
      WHERE rh.hospital_id = @hospital_id
        AND rh.status = 'approved'
    `);

    const stats = {
      totalBloodUnits,
      registeredDonors: donorResult.recordset[0].total_donors || 0,
      pendingRequests: pendingResult.recordset[0].pending_count || 0,
      pendingTransfers: transfersResult.recordset[0].pending_transfers_count || 0,
      urgentRequests: urgentResult.recordset[0].urgent_count || 0,
      bloodInventory,
      lastUpdated: Date.now()
    };

    await updateDashboardStats(hospitalId, stats);
    return stats;
  } catch (error) {
    console.error('Rebuild dashboard cache error:', error.message);
    throw error;
  }
}

module.exports = {
  initializeFirebase,
  updateDashboardStats,
  getDashboardStats,
  incrementCounter,
  updateBloodInventory,
  rebuildDashboardCache
};
