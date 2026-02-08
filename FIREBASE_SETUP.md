# Firebase Realtime Database Setup for Dashboard Caching

## Overview
Firebase Realtime Database is used to cache dashboard statistics for improved performance. Instead of running 6+ SQL queries on every dashboard page load, we maintain a cached copy that updates only when data changes.

## Benefits
- **Performance**: Dashboard loads in <50ms vs ~500ms with SQL queries
- **Real-time**: Updates propagate instantly through Socket.IO + cache updates
- **Scalability**: Reduces database load significantly
- **Reliability**: Falls back to SQL if Firebase is unavailable

## Firebase Console Setup

### 1. Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or use existing project
3. Enter project name (e.g., "blood-bank-dashboard")
4. Disable Google Analytics (optional)
5. Click "Create project"

### 2. Enable Realtime Database
1. In Firebase Console, select your project
2. Navigate to **Build** > **Realtime Database**
3. Click "Create Database"
4. Choose location (closest to your users)
5. Start in **test mode** (we'll set rules later)
6. Click "Enable"

### 3. Get Service Account Key
1. In Firebase Console, click the gear icon ⚙️ > **Project settings**
2. Go to **Service accounts** tab
3. Click "Generate new private key"
4. Click "Generate key" - JSON file will download
5. **IMPORTANT**: Keep this file secure, never commit to git!

### 4. Configure Environment Variables
Open `server/.env` and add:

```env
# Firebase Configuration
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project-id",...}
FIREBASE_DATABASE_URL=https://your-project-id-default-rtdb.firebaseio.com
```

**FIREBASE_SERVICE_ACCOUNT**: Paste the entire contents of the downloaded JSON file as a single line string (no line breaks).

**FIREBASE_DATABASE_URL**: Copy from Firebase Console > Realtime Database page (shown at top).

### 5. Set Database Rules
In Firebase Console > Realtime Database > Rules tab:

```json
{
  "rules": {
    "hospitals": {
      "$hospital_id": {
        ".read": "auth.uid === $hospital_id",
        ".write": "auth.uid === $hospital_id",
        "dashboard": {
          ".validate": "newData.hasChildren(['totalBloodUnits', 'registeredDonors', 'urgentRequests', 'pendingRequests', 'pendingTransfers', 'bloodInventory'])"
        }
      }
    }
  }
}
```

Note: Since we're using Admin SDK from backend, these rules apply to client access. Backend has full access.

## Data Structure

Firebase stores dashboard data per hospital:

```
hospitals/
  {hospital_id}/
    dashboard/
      totalBloodUnits: 145
      registeredDonors: 87
      urgentRequests: 3
      pendingRequests: 12
      pendingTransfers: 2
      bloodInventory/
        A+: 12500
        A-: 3200
        B+: 8900
        B-: 2100
        AB+: 4500
        AB-: 1800
        O+: 15600
        O-: 5400
      lastUpdated: 1704123456789
```

## Cache Update Flow

### When Data Changes
1. **Donor Registration**: Increment `registeredDonors`
2. **Donation Created**: Increment `totalBloodUnits`, update blood type in `bloodInventory`
3. **Request Assigned**: Increment `pendingRequests`, conditionally `urgentRequests`
4. **Request Approved**: Decrement `pendingRequests`, increment `pendingTransfers`, decrement `urgentRequests`
5. **Transfer Made**: Decrement `pendingTransfers`, `totalBloodUnits`, update `bloodInventory`

### Dashboard Load
1. Try reading from Firebase cache
2. If cache hit: Return cached data (fast!)
3. If cache miss: Query SQL and rebuild cache

### Force Refresh
Add `?force_refresh=true` to dashboard API call to bypass cache and rebuild from SQL:
```
GET /api/hospital/dashboard/stats?hospital_id=H001&force_refresh=true
```

## Installation

### 1. Install Dependencies
```bash
cd server
npm install
```

This will install `firebase-admin` from package.json.

### 2. For Blood-Connect Backend
```bash
cd ../blood-connect/backend
npm install
```

This will install `axios` for webhook calls.

## Testing

### 1. Verify Firebase Connection
```bash
cd server
node -e "require('./services/firebaseCache').initializeFirebase().then(() => console.log('✅ Firebase connected')).catch(e => console.error('❌', e))"
```

### 2. Test Cache Operations
```javascript
const { updateDashboardStats, getDashboardStats } = require('./services/firebaseCache');

// Write test data
await updateDashboardStats('H001', {
  totalBloodUnits: 100,
  registeredDonors: 50,
  urgentRequests: 5,
  pendingRequests: 10,
  pendingTransfers: 2,
  bloodInventory: { 'A+': 10000, 'B+': 8000 }
});

// Read test data
const stats = await getDashboardStats('H001');
console.log(stats);
```

### 3. Monitor Firebase Console
1. Open Firebase Console > Realtime Database
2. Watch the `hospitals` node populate as you use the app
3. See real-time updates as data changes

## Troubleshooting

### Error: "Failed to parse private key"
- Check FIREBASE_SERVICE_ACCOUNT format
- Ensure it's a valid JSON string
- No line breaks or extra spaces

### Error: "Permission denied"
- Verify database rules allow write access
- Admin SDK should bypass rules, check initialization

### Cache Not Updating
- Check server console for Firebase errors
- Verify webhook endpoint is reachable
- Check blood-connect HOSPITAL_API_URL environment variable

### Fallback to SQL
- Firebase failures won't break the app
- Check logs for Firebase connection errors
- Dashboard will query SQL directly if cache unavailable

## Performance Monitoring

### Firebase Console Metrics
- Navigate to Firebase Console > Realtime Database > Usage tab
- Monitor: Reads, Writes, Bandwidth, Storage
- Free tier: 1GB storage, 10GB/month downloads

### Expected Usage
- Writes: ~10-50 per day per hospital (data changes)
- Reads: ~500-1000 per day per hospital (dashboard views)
- Storage: <1MB per hospital
- Well within free tier limits for most use cases

## Production Recommendations

1. **Secure Service Account**: Store in Azure Key Vault or similar
2. **Monitor Usage**: Set up Firebase budget alerts
3. **Cache Expiry**: Consider adding TTL (currently indefinite)
4. **Backup Strategy**: Firebase data can be exported periodically
5. **Rate Limiting**: Implement on cache update endpoints
6. **Error Alerts**: Configure monitoring for cache failures

## Cost Estimation

Firebase Realtime Database pricing (as of 2024):
- **Free Tier**: 1GB storage, 10GB/month bandwidth, 100 simultaneous connections
- **Paid Plan**: $5/GB storage, $1/GB bandwidth

For typical blood bank with 10 hospitals:
- Storage: <10MB (well under free tier)
- Bandwidth: ~1GB/month (within free tier)
- **Estimated Cost: $0/month**

## Additional Resources

- [Firebase Realtime Database Docs](https://firebase.google.com/docs/database)
- [Admin SDK Setup](https://firebase.google.com/docs/admin/setup)
- [Security Rules Guide](https://firebase.google.com/docs/database/security)
- [Node.js Quickstart](https://firebase.google.com/docs/database/admin/start)
