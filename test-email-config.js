require("dotenv").config();
const nodemailer = require('nodemailer');

console.log('\n🔍 Testing Email Configuration...\n');

// Check if credentials are set
console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('EMAIL_APP_PASSWORD:', process.env.EMAIL_APP_PASSWORD ? '***' + process.env.EMAIL_APP_PASSWORD.slice(-4) : 'NOT SET');

if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your-email@gmail.com') {
  console.error('\n❌ ERROR: Email credentials not configured!');
  console.log('\n📝 Steps to fix:');
  console.log('1. Go to: https://myaccount.google.com/apppasswords');
  console.log('2. Create an App Password for "Mail"');
  console.log('3. Update .env file with:');
  console.log('   EMAIL_USER=your-actual-email@gmail.com');
  console.log('   EMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx');
  process.exit(1);
}

// Create transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

// Test connection
console.log('\n🔌 Testing SMTP connection...');

transporter.verify(function(error, success) {
  if (error) {
    console.error('\n❌ SMTP Connection Failed:');
    console.error(error.message);
    console.log('\n💡 Common issues:');
    console.log('1. Gmail App Password not generated (requires 2FA enabled)');
    console.log('2. Wrong email/password in .env');
    console.log('3. "Less secure app access" disabled (if not using App Password)');
    console.log('\n📖 Fix guide: https://myaccount.google.com/apppasswords');
  } else {
    console.log('\n✅ SMTP Connection Successful!');
    console.log('✅ Email service is ready to send OTPs');
    
    // Send test email
    console.log('\n📧 Sending test OTP email...');
    
    const testOTP = '123456';
    const mailOptions = {
      from: `"Blood Bank Buddy" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER, // Send to yourself
      subject: 'Test OTP - Blood Bank',
      html: `
        <h2>Test OTP Email</h2>
        <p>Your test OTP is: <strong>${testOTP}</strong></p>
        <p>If you receive this, your email configuration is working!</p>
      `
    };

    transporter.sendMail(mailOptions, function(error, info) {
      if (error) {
        console.error('\n❌ Failed to send email:');
        console.error(error.message);
      } else {
        console.log('\n✅ Test email sent successfully!');
        console.log('📬 Check your inbox:', process.env.EMAIL_USER);
        console.log('Message ID:', info.messageId);
      }
    });
  }
});
