# Blood Bank Backend API

Node.js Express API for Blood Bank Buddy connected to Azure Cosmos DB.

## Setup

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Environment Variables

The `.env` file is already configured with your Cosmos DB credentials.

### 3. Run the Server

**Development (with auto-reload):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

Server runs on `http://localhost:5000`

## API Endpoints

### Register Hospital
```
POST /api/auth/register
Content-Type: application/json

{
  "email": "hospital@example.com",
  "password": "password123",
  "hospitalName": "City Hospital",
  "phone": "+1234567890",
  "address": "123 Medical St",
  "city": "New York",
  "state": "NY"
}

Response:
{
  "success": true,
  "message": "Hospital registered successfully",
  "data": {
    "hospital_id": "0001",
    "email": "hospital@example.com",
    "hospitalName": "City Hospital",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Login Hospital
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "hospital@example.com",
  "password": "password123"
}

Response:
{
  "success": true,
  "message": "Login successful",
  "data": {
    "hospital_id": "0001",
    "email": "hospital@example.com",
    "hospitalName": "City Hospital",
    "phone": "+1234567890",
    "address": "123 Medical St",
    "city": "New York",
    "state": "NY",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Get Hospital Profile
```
GET /api/hospitals/{hospital_id}

Response:
{
  "success": true,
  "data": {
    "id": "0001",
    "hospital_id": "0001",
    "email": "hospital@example.com",
    "hospitalName": "City Hospital",
    ...
  }
}
```

### Health Check
```
GET /api/health

Response:
{
  "status": "API is running"
}
```

## Features

✅ Hospital Registration with auto-generated hospital_id (0001, 0002, etc.)  
✅ Hospital Login with JWT authentication  
✅ Password hashing with bcryptjs  
✅ Cosmos DB integration  
✅ Email uniqueness validation  
✅ CORS enabled  

## Database Structure

**Cosmos DB:**
- Account: `blood`
- Database: `BloodBankDB`
- Container: `hospitals`
- Partition Key: `/hospital_id`

**Hospital Document:**
```json
{
  "id": "0001",
  "hospital_id": "0001",
  "email": "hospital@example.com",
  "password": "hashed_password",
  "hospitalName": "City Hospital",
  "phone": "+1234567890",
  "address": "123 Medical St",
  "city": "New York",
  "state": "NY"
}
```

## Next Steps

1. Install dependencies: `npm install`
2. Run the server: `npm run dev`
3. Update your React app to call these API endpoints
4. Later: Add SQL Database for inventory data
