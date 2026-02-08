# 🚀 Quick Start - Email Verification

## ⚡ 3-Step Setup

### 1. Configure Email (REQUIRED)
Edit `.env` file:
```env
EMAIL_USER=your-email@gmail.com
EMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

**Get Gmail App Password:**
1. Visit: https://myaccount.google.com/apppasswords
2. Create password for "Mail" app
3. Copy 16-character code
4. Paste in `.env`

### 2. Start Server
```bash
cd "G:\Blood Inventory management\blood-bank-buddy\server"
npm start
```

### 3. Test It!
Register → Get OTP in email → Verify → Login ✅

---

## 📋 API Endpoints

### Register (sends OTP)
```
POST /api/auth/register
{ "email": "test@example.com", "password": "pass123", "hospitalName": "Test" }
```

### Verify OTP
```
POST /api/auth/verify-otp
{ "hospital_id": "0001", "email": "test@example.com", "otp": "123456" }
```

### Resend OTP
```
POST /api/auth/resend-otp
{ "hospital_id": "0001", "email": "test@example.com" }
```

### Login (requires verification)
```
POST /api/auth/login
{ "email": "test@example.com", "password": "pass123" }
```

---

## 🔍 What Changed?

✅ **Registration**: Now sends OTP email (no JWT token yet)  
✅ **Login**: Blocks unverified accounts  
✅ **New Endpoints**: verify-otp, resend-otp  
✅ **Database**: Adds emailVerified, otp, otpExpiry fields  
✅ **Everything Else**: Unchanged - all existing features work!

---

## ⚠️ Important Notes

- OTP expires in **10 minutes**
- Existing hospitals **NOT affected** (can login normally)
- Only **new registrations** need verification
- Must configure email in `.env` before testing

---

## 🐛 Troubleshooting

**Email not sending?**
- Check `.env` has EMAIL_USER and EMAIL_APP_PASSWORD
- Generate new Gmail App Password
- Check server logs for errors

**Can't login?**
- Response will say "Email not verified"
- Use `/api/auth/resend-otp` to get new code
- Check spam folder for OTP email

---

**Status:** ✅ READY  
**Implementation:** COMPLETE  
**Breaking Changes:** NONE
