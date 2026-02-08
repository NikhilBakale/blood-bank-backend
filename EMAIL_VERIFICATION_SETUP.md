# Email Verification Setup Guide

## ✅ Implementation Complete!

Email verification with OTP has been successfully integrated into your Blood Bank Management System.

## 🎯 What's Been Added:

### 1. **Email Service** (`services/emailService.js`)
- Generates 6-digit OTP codes
- Sends professional HTML emails
- OTP validity: 10 minutes
- Welcome email after verification

### 2. **New API Endpoints**

#### **Verify OTP**
```
POST /api/auth/verify-otp
Body: {
  "hospital_id": "0001",
  "email": "hospital@example.com",
  "otp": "123456"
}
```

#### **Resend OTP**
```
POST /api/auth/resend-otp
Body: {
  "hospital_id": "0001",
  "email": "hospital@example.com"
}
```

### 3. **Modified Endpoints**

#### **Registration** (`/api/auth/register`)
- Now generates OTP and sends email
- Returns `requiresVerification: true`
- No JWT token until verified

#### **Login** (`/api/auth/login`)
- Checks if email is verified
- Blocks unverified accounts
- Returns verification reminder

## 📧 Email Configuration

### Step 1: Update `.env` File

Add your email credentials to `.env`:

```env
# Email Configuration for OTP verification
EMAIL_USER=your-email@gmail.com
EMAIL_APP_PASSWORD=your-app-password
```

### Step 2: Get Gmail App Password

1. Go to [Google Account Settings](https://myaccount.google.com/)
2. Enable **2-Factor Authentication** (required)
3. Go to [App Passwords](https://myaccount.google.com/apppasswords)
4. Create new app password:
   - App: "Mail"
   - Device: "Other" (name it "Blood Bank")
5. Copy the 16-character password
6. Paste in `.env` as `EMAIL_APP_PASSWORD`

**Example:**
```env
EMAIL_USER=bloodbank@gmail.com
EMAIL_APP_PASSWORD=abcd efgh ijkl mnop
```

### Alternative Email Services:

#### **Outlook/Hotmail:**
```env
EMAIL_USER=yourname@outlook.com
EMAIL_APP_PASSWORD=your-password
```
Change service in `services/emailService.js`:
```javascript
service: 'outlook', // instead of 'gmail'
```

#### **Yahoo:**
```env
EMAIL_USER=yourname@yahoo.com
EMAIL_APP_PASSWORD=app-specific-password
```
Change to:
```javascript
service: 'yahoo',
```

## 🚀 Testing the Integration

### 1. Start the Server
```bash
cd "G:\Blood Inventory management\blood-bank-buddy\server"
npm start
```

### 2. Test Registration
```bash
POST http://localhost:5000/api/auth/register
{
  "email": "test@example.com",
  "password": "password123",
  "hospitalName": "Test Hospital",
  "phone": "1234567890",
  "address": "123 Main St",
  "city": "Mumbai",
  "state": "Maharashtra"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Registration successful! Please check your email for OTP verification.",
  "data": {
    "hospital_id": "0001",
    "email": "test@example.com",
    "hospitalName": "Test Hospital",
    "requiresVerification": true
  }
}
```

### 3. Check Your Email
You should receive an email with a 6-digit OTP code.

### 4. Verify OTP
```bash
POST http://localhost:5000/api/auth/verify-otp
{
  "hospital_id": "0001",
  "email": "test@example.com",
  "otp": "123456"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Email verified successfully! You can now log in.",
  "data": {
    "hospital_id": "0001",
    "email": "test@example.com",
    "hospitalName": "Test Hospital",
    "emailVerified": true,
    "token": "jwt-token-here"
  }
}
```

### 5. Test Login
```bash
POST http://localhost:5000/api/auth/login
{
  "email": "test@example.com",
  "password": "password123"
}
```

**If Not Verified:**
```json
{
  "error": "Email not verified",
  "message": "Please verify your email before logging in. Check your inbox for the OTP.",
  "requiresVerification": true,
  "hospital_id": "0001",
  "email": "test@example.com"
}
```

**If Verified:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "hospital_id": "0001",
    "email": "test@example.com",
    "hospitalName": "Test Hospital",
    "token": "jwt-token-here"
  }
}
```

## 🔄 User Flow

```
1. User Registers
   ↓
2. OTP Sent to Email (valid 10 minutes)
   ↓
3. User Enters OTP
   ↓
4. Email Verified ✅
   ↓
5. Welcome Email Sent
   ↓
6. User Can Login
```

## 📱 Frontend Integration (Coming Soon)

You'll need to create these screens in your React app:

### 1. **OTP Verification Screen**
```jsx
// After registration, show OTP input
<input 
  type="text" 
  maxLength="6" 
  placeholder="Enter 6-digit OTP"
/>
<button onClick={verifyOTP}>Verify</button>
<button onClick={resendOTP}>Resend OTP</button>
```

### 2. **Unverified Login Handler**
```javascript
try {
  const response = await login(email, password);
} catch (error) {
  if (error.requiresVerification) {
    // Redirect to OTP verification page
    navigate('/verify-email', { 
      state: { 
        hospital_id: error.hospital_id,
        email: error.email 
      }
    });
  }
}
```

## 🛠️ Troubleshooting

### Problem: Email not sending

**Solution 1:** Check Gmail App Password
```bash
# Verify .env has correct credentials
cat .env | grep EMAIL
```

**Solution 2:** Enable "Less secure app access" (not recommended)
- Go to Google Account → Security
- Turn on "Allow less secure apps"

**Solution 3:** Check server logs
```bash
# Look for email errors
npm start
# Check for: "✅ OTP email sent" or "❌ Failed to send OTP email"
```

### Problem: OTP expired

**Solution:** Use resend OTP endpoint
```bash
POST /api/auth/resend-otp
{
  "hospital_id": "0001",
  "email": "test@example.com"
}
```

### Problem: Port already in use

**Solution:**
```bash
# Kill process on port 5000
netstat -ano | findstr :5000
taskkill /PID <process-id> /F
```

## 📊 Database Changes

### Cosmos DB Hospital Document
New fields added:
```json
{
  "hospital_id": "0001",
  "email": "hospital@example.com",
  "emailVerified": false,        // ← New field
  "otp": "123456",               // ← New field (removed after verification)
  "otpExpiry": "2026-01-21T12:00:00Z", // ← New field (removed after verification)
  "hospitalName": "Test Hospital",
  "password": "hashed-password"
}
```

## 🔐 Security Features

✅ **OTP Expiry**: 10 minutes validity  
✅ **One-time use**: OTP deleted after verification  
✅ **Resend throttling**: Can request new OTP anytime  
✅ **Blocked login**: Unverified users cannot access system  
✅ **Password hashing**: Using bcrypt (unchanged)  
✅ **JWT tokens**: Only issued after email verification  

## 📝 Notes

- Existing hospitals (already registered) are **not affected**
- They can login normally without verification
- Only **new registrations** require OTP verification
- To require verification for existing users, manually update Cosmos DB:
  ```javascript
  // Set emailVerified: false for existing hospitals
  ```

## 🎨 Email Templates

Both OTP and Welcome emails use responsive HTML templates with:
- Hospital name personalization
- Clear instructions
- Professional styling
- Mobile-friendly design

## 📞 Support

If you encounter issues:
1. Check server logs: `npm start`
2. Verify `.env` configuration
3. Test email sending separately
4. Check Cosmos DB for hospital document

---

**Status:** ✅ Ready to Use  
**Last Updated:** January 21, 2026  
**Version:** 1.0.0
