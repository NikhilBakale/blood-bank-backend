# 🚨 OTP Not Working - FIX IT NOW!

## ❌ Problem: Email not configured in .env

Your `.env` file still has placeholder values:
```env
EMAIL_USER=your-email@gmail.com          ❌ NEEDS TO BE CHANGED
EMAIL_APP_PASSWORD=your-app-password-here ❌ NEEDS TO BE CHANGED
```

## ✅ Solution: Configure Real Email

### Step 1: Get Gmail App Password

1. **Enable 2-Factor Authentication** (REQUIRED)
   - Go to: https://myaccount.google.com/security
   - Find "2-Step Verification" → Turn it ON
   - Follow the setup process

2. **Generate App Password**
   - Go to: https://myaccount.google.com/apppasswords
   - Select: App = "Mail", Device = "Other" (name it "Blood Bank")
   - Click "Generate"
   - Copy the 16-character password (e.g., `abcd efgh ijkl mnop`)

### Step 2: Update .env File

Open: `G:\Blood Inventory management\blood-bank-buddy\server\.env`

Replace lines 22-23 with:
```env
EMAIL_USER=your-actual-email@gmail.com
EMAIL_APP_PASSWORD=abcd efgh ijkl mnop
```

**Example:**
```env
EMAIL_USER=hospital123@gmail.com
EMAIL_APP_PASSWORD=xqya hmnp qkwl rfba
```

### Step 3: Test Email Configuration

Run this command:
```bash
cd "G:\Blood Inventory management\blood-bank-buddy\server"
node test-email-config.js
```

**Expected Output:**
```
✅ SMTP Connection Successful!
✅ Email service is ready to send OTPs
✅ Test email sent successfully!
```

### Step 4: Restart Server

```bash
npm start
```

---

## 🔧 Alternative: Use Outlook

If you prefer Outlook/Hotmail:

**Update .env:**
```env
EMAIL_USER=yourname@outlook.com
EMAIL_APP_PASSWORD=your-outlook-password
```

**Update emailService.js (line 5):**
```javascript
service: 'outlook', // changed from 'gmail'
```

---

## 🐛 Troubleshooting

### Error: "Invalid login"
- Generate new App Password
- Make sure 2FA is enabled
- Check for typos in .env

### Error: "Less secure app"
- Use App Password instead (more secure)
- Or enable "Less secure app access" (not recommended)

### Email not arriving
- Check spam/junk folder
- Verify EMAIL_USER is correct
- Test with: `node test-email-config.js`

---

## ⚡ Quick Fix Checklist

- [ ] Enable 2FA on Gmail
- [ ] Generate App Password
- [ ] Update .env with real credentials
- [ ] Run: `node test-email-config.js`
- [ ] Restart server: `npm start`
- [ ] Test registration

---

**Need help?** Run the test script:
```bash
node test-email-config.js
```

It will tell you exactly what's wrong!
