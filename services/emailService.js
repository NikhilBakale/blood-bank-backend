const nodemailer = require('nodemailer');

// Create email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail', // You can change to 'outlook', 'yahoo', etc.
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP email
async function sendOTPEmail(email, otp, hospitalName) {
  const mailOptions = {
    from: `"Blood Bank Buddy" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verify Your Email - Blood Bank Registration',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
          .otp-box { background-color: white; border: 2px dashed #dc2626; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px; }
          .otp-code { font-size: 32px; font-weight: bold; color: #dc2626; letter-spacing: 5px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .warning { color: #dc2626; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🩸 Blood Bank Buddy</h1>
          </div>
          <div class="content">
            <h2>Welcome, ${hospitalName}!</h2>
            <p>Thank you for registering with Blood Bank Buddy. To complete your registration, please verify your email address.</p>
            
            <div class="otp-box">
              <p style="margin: 0; font-size: 14px; color: #666;">Your verification code is:</p>
              <div class="otp-code">${otp}</div>
            </div>
            
            <p><strong>Important:</strong></p>
            <ul>
              <li>This OTP is valid for <span class="warning">10 minutes</span></li>
              <li>Do not share this code with anyone</li>
              <li>If you didn't register, please ignore this email</li>
            </ul>
            
            <p>Once verified, you'll be able to:</p>
            <ul>
              <li>✅ Manage blood inventory</li>
              <li>✅ Register donors</li>
              <li>✅ Request blood transfers</li>
              <li>✅ Track donations in real-time</li>
            </ul>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply.</p>
            <p>&copy; 2026 Blood Bank Buddy. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ OTP email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to send OTP email:', error.message);
    throw error;
  }
}

// Send welcome email after verification
async function sendWelcomeEmail(email, hospitalName) {
  const mailOptions = {
    from: `"Blood Bank Buddy" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Welcome to Blood Bank Buddy! 🎉',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #16a34a; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
          .button { background-color: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Email Verified Successfully!</h1>
          </div>
          <div class="content">
            <h2>Welcome aboard, ${hospitalName}!</h2>
            <p>Your email has been verified and your account is now active.</p>
            <p>You can now access all features of the Blood Bank Management System.</p>
            <p>If you need any assistance, feel free to contact our support team.</p>
            <p style="margin-top: 30px;">Best regards,<br><strong>Blood Bank Buddy Team</strong></p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Welcome email sent to ${email}`);
  } catch (error) {
    console.error('⚠️ Failed to send welcome email:', error.message);
    // Don't throw - welcome email is not critical
  }
}

// Send thank you email to donor when their blood is transferred
async function sendDonorThankYouEmail(donorEmail, donorName, bloodId, bloodType, componentType, volumeMl) {
  const mailOptions = {
    from: `"Blood Bank Buddy" <${process.env.EMAIL_USER}>`,
    to: donorEmail,
    subject: 'Your Blood Donation Has Saved a Life! 🩸❤️',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #dc2626; color: white; padding: 30px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
          .highlight-box { background-color: white; border-left: 4px solid #dc2626; padding: 20px; margin: 20px 0; border-radius: 5px; }
          .donation-details { background-color: #fff; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .detail-row { display: flex; padding: 8px 0; border-bottom: 1px solid #eee; }
          .detail-label { font-weight: bold; color: #666; min-width: 150px; }
          .detail-value { color: #333; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .thank-you { font-size: 24px; color: #dc2626; font-weight: bold; text-align: center; margin: 20px 0; }
          .icon { font-size: 48px; text-align: center; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="icon">❤️🩸</div>
            <h1>Your Donation Made a Difference!</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${donorName}</strong>,</p>
            
            <div class="highlight-box">
              <p style="font-size: 16px; margin: 0;">
                <strong>We have wonderful news!</strong> The blood you generously donated has been successfully transferred to a patient in need. Your selfless act of kindness has potentially saved a life.
              </p>
            </div>

            <h3>Donation Details:</h3>
            <div class="donation-details">
              <div class="detail-row">
                <span class="detail-label">Blood ID:</span>
                <span class="detail-value">${bloodId}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Blood Type:</span>
                <span class="detail-value">${bloodType}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Component:</span>
                <span class="detail-value">${componentType}</span>
              </div>
              <div class="detail-row" style="border-bottom: none;">
                <span class="detail-label">Volume:</span>
                <span class="detail-value">${volumeMl} ml</span>
              </div>
            </div>

            <div class="thank-you">
              THANK YOU FOR YOUR GIFT OF LIFE!
            </div>

            <p><strong>Your impact:</strong></p>
            <ul>
              <li>✅ You've helped save a life</li>
              <li>✅ Your donation reached a patient in need</li>
              <li>✅ You've made a real difference in someone's life</li>
            </ul>

            <p>
              Every donation counts, and your contribution is invaluable to our community. 
              We hope to see you again for your next donation!
            </p>

            <p><strong>Consider donating again:</strong></p>
            <p>
              You can donate whole blood every 56 days. Regular donations help maintain a stable 
              blood supply for emergencies and planned medical procedures.
            </p>

            <p style="margin-top: 30px;">
              With heartfelt gratitude,<br>
              <strong>Blood Bank Buddy Team</strong>
            </p>
          </div>
          <div class="footer">
            <p>This is an automated notification. Please do not reply to this email.</p>
            <p>&copy; 2026 Blood Bank Buddy. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Thank you email sent to donor: ${donorEmail} for blood ID: ${bloodId}`);
    return true;
  } catch (error) {
    console.error('⚠️ Failed to send donor thank you email:', error.message);
    // Don't throw - email failure shouldn't stop the transfer
    return false;
  }
}

module.exports = {
  generateOTP,
  sendOTPEmail,
  sendWelcomeEmail,
  sendDonorThankYouEmail
};
