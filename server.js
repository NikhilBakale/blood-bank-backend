require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { CosmosClient } = require("@azure/cosmos");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sql = require("mssql");
const { getConnection } = require("./db/sqlConnection");
const bloodRoutes = require("./routes/bloodRoutes");
const { incrementCounter, updateBloodInventory } = require("./services/firebaseCache");
const { generateOTP, sendOTPEmail, sendWelcomeEmail, sendDonorThankYouEmail } = require("./services/emailService");

const app = express();
const server = http.createServer(app);

// CORS Configuration - Read allowed origins from environment variable
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ["http://localhost:5173", "http://localhost:5174", "http://localhost:8080", "http://localhost:8081"];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

// Make io accessible to routes
app.set('io', io);

// Enable CORS for Express app
app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

const PORT = process.env.PORT || 5000;
const isDevelopment = process.env.NODE_ENV !== 'production';

// Initialize SQL Database Connection
async function initializeSQL() {
  try {
    console.log("🔧 Connecting to Azure SQL Server...");
    
    // Wrap in a timeout promise (20 seconds max)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Connection timeout")), 20000)
    );
    
    const connectionPromise = getConnection();
    await Promise.race([connectionPromise, timeoutPromise]);
    console.log("✅ Azure SQL Server connected successfully");
  } catch (error) {
    console.error("❌ Azure SQL connection failed:", error.message);
    console.warn("⚠️  Running in Cosmos-only mode. SQL features will be unavailable until Azure SQL is accessible.");
    console.warn("💡 Check: Firewall rules, Azure SQL access, and AAD authentication setup");
    // Don't throw - allow app to start anyway
  }
}

// Cosmos DB Client
const cosmosClient = new CosmosClient({
  endpoint: process.env.COSMOS_DB_ENDPOINT,
  key: process.env.COSMOS_DB_KEY,
});

let database;
let container;

// Initialize Cosmos DB - reference existing database and container
async function initializeCosmos() {
  try {
    console.log("🔧 Connecting to Cosmos DB...");
    
    // Reference the database and container directly (they should already exist in Azure Portal)
    database = cosmosClient.database(process.env.COSMOS_DB_DATABASE);
    container = database.container(process.env.COSMOS_DB_CONTAINER);
    
    // Test the connection with a simple read
    await container.read();
    
    console.log("✅ Connected to Database:", process.env.COSMOS_DB_DATABASE);
    console.log("✅ Connected to Container:", process.env.COSMOS_DB_CONTAINER);
  } catch (error) {
    console.error("❌ Cosmos DB connection failed:", error.message);
    console.error("\n⚠️  Make sure to create these in Azure Portal:");
    console.error("   Database ID:", process.env.COSMOS_DB_DATABASE);
    console.error("   Container ID:", process.env.COSMOS_DB_CONTAINER);
    console.error("   Partition Key: /hospital_id");
    process.exit(1);
  }
}

// Utility function to generate next hospital_id
async function getNextHospitalId() {
  try {
    const query = "SELECT * FROM c ORDER BY c.hospital_id DESC";
    const { resources } = await container.items.query(query).fetchAll();
    
    if (resources.length === 0) {
      return "0001";
    }
    
    const lastId = parseInt(resources[0].hospital_id);
    const nextId = lastId + 1;
    return String(nextId).padStart(4, "0");
  } catch (error) {
    console.error("Error getting next hospital ID:", error);
    return "0001";
  }
}

// Utility function to hash password
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

// Utility function to compare password
async function comparePassword(password, hashedPassword) {
  return bcrypt.compare(password, hashedPassword);
}

// Generate JWT token
function generateToken(hospitalId) {
  return jwt.sign(
    { hospital_id: hospitalId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
}

// ============ API ENDPOINTS ============

// Register Hospital
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, hospitalName, phone, address, city, state } = req.body;

    // Validation
    if (!email || !password || !hospitalName) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Check if email already exists
    const query = `SELECT * FROM c WHERE c.email = @email`;
    const { resources } = await container.items
      .query(query, { parameters: [{ name: "@email", value: email }] })
      .fetchAll();

    if (resources.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Generate next hospital_id
    const hospital_id = await getNextHospitalId();

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Generate OTP for email verification
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Create hospital document
    const newHospital = {
      id: hospital_id,
      hospital_id: hospital_id,
      email: email,
      password: hashedPassword,
      hospitalName: hospitalName,
      phone: phone || "",
      address: address || "",
      city: city || "",
      state: state || "",
      emailVerified: false,
      otp: otp,
      otpExpiry: otpExpiry.toISOString(),
    };

    // Store in Cosmos DB
    const { resource } = await container.items.create(newHospital);

    // Send OTP email
    try {
      await sendOTPEmail(email, otp, hospitalName);
      console.log(`✅ OTP sent to ${email}`);
    } catch (emailError) {
      console.error('⚠️ Failed to send OTP email:', emailError.message);
      // Continue registration even if email fails
    }

    // Also store in Azure SQL for referential integrity
    try {
      const pool = await getConnection();
      let postal_code = null;
      
      // Look up or create postal_code from city and state if provided
      if (city && state) {
        const lookupRequest = pool.request();
        lookupRequest.input("city", sql.NVarChar(100), city);
        lookupRequest.input("state", sql.VarChar(50), state);
        
        const postalResult = await lookupRequest.query(`
          SELECT TOP 1 postal_code FROM postal_codes 
          WHERE city = @city AND state = @state
        `);
        
        if (postalResult.recordset.length > 0) {
          postal_code = postalResult.recordset[0].postal_code;
          console.log(`✅ Found postal_code: ${postal_code} for ${city}, ${state}`);
        } else {
          console.log(`⚠️  No postal_code found for ${city}, ${state} - inserting with NULL`);
        }
      }
      
      const request = pool.request();
      request.input("hospital_id", sql.VarChar(10), hospital_id);
      request.input("name", sql.NVarChar(255), hospitalName);
      request.input("phone", sql.VarChar(20), phone || null);
      request.input("address", sql.NVarChar(500), address || null);
      request.input("postal_code", sql.VarChar(10), postal_code);
      request.input("email", sql.NVarChar(255), email);
      
      await request.query(`
        INSERT INTO hospitals (hospital_id, name, address, postal_code, phone, email)
        VALUES (@hospital_id, @name, @address, @postal_code, @phone, @email)
      `);
      
      console.log("✅ Hospital also inserted into SQL:", hospital_id);
    } catch (sqlError) {
      console.error("⚠️  Failed to insert hospital into SQL:", sqlError.message);
      // Don't fail the registration if SQL sync fails
    }

    res.status(201).json({
      success: true,
      message: "Registration successful! Please check your email for OTP verification.",
      data: {
        hospital_id: hospital_id,
        email: email,
        hospitalName: hospitalName,
        requiresVerification: true,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed", details: error.message });
  }
});

// Login Hospital
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("\nLogin request received:");
    console.log("  Email:", email);
    console.log("  Password entered length:", password ? password.length : 0);

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    // Find hospital by email - get all to debug
    const allQuery = "SELECT * FROM c";
    const { resources: allHospitals } = await container.items.query(allQuery).fetchAll();
    
    let hospital = null;
    for (const h of allHospitals) {
      if (h.email === email) {
        hospital = h;
        break;
      }
    }

    if (!hospital) {
      console.log("  ❌ Hospital not found with email:", email);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    console.log("  ✅ Hospital found:", hospital.email);
    console.log("  Stored password hash length:", hospital.password ? hospital.password.length : 0);

    // Compare passwords
    const isPasswordValid = await comparePassword(password, hospital.password);
    console.log("  Password match result:", isPasswordValid);

    if (!isPasswordValid) {
      console.log("  ❌ Password does not match");
      return res.status(401).json({ error: "Invalid email or password" });
    }

    console.log("  ✅ Password verified successfully");

    // Check if email is verified (only for accounts created with OTP system)
    // Old accounts don't have emailVerified field, so treat them as verified
    if (hospital.hasOwnProperty('emailVerified') && !hospital.emailVerified) {
      console.log("  ⚠️  Email not verified");
      return res.status(403).json({ 
        error: "Email not verified",
        message: "Please verify your email before logging in. Check your inbox for the OTP.",
        requiresVerification: true,
        hospital_id: hospital.hospital_id,
        email: hospital.email
      });
    }

    // Generate JWT token
    const token = generateToken(hospital.hospital_id);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        hospital_id: hospital.hospital_id,
        email: hospital.email,
        hospitalName: hospital.hospitalName,
        phone: hospital.phone,
        address: hospital.address,
        city: hospital.city,
        state: hospital.state,
        token: token,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed", details: error.message });
  }
});

// Verify OTP
app.post("/api/auth/verify-otp", async (req, res) => {
  try {
    const { hospital_id, email, otp } = req.body;

    console.log("\nOTP verification request:");
    console.log("  Hospital ID:", hospital_id);
    console.log("  Email:", email);
    console.log("  OTP:", otp);

    // Validation
    if (!hospital_id || !email || !otp) {
      return res.status(400).json({ error: "Hospital ID, email, and OTP are required" });
    }

    // Find hospital
    const { resource: hospital } = await container.item(hospital_id, hospital_id).read();

    if (!hospital) {
      return res.status(404).json({ error: "Hospital not found" });
    }

    // Check if already verified
    if (hospital.emailVerified) {
      return res.status(400).json({ 
        error: "Email already verified",
        message: "You can now log in to your account"
      });
    }

    // Check if OTP matches
    if (hospital.otp !== otp) {
      console.log("  ❌ Invalid OTP");
      return res.status(400).json({ error: "Invalid OTP. Please check and try again." });
    }

    // Check if OTP expired
    const otpExpiry = new Date(hospital.otpExpiry);
    if (Date.now() > otpExpiry.getTime()) {
      console.log("  ❌ OTP expired");
      return res.status(400).json({ 
        error: "OTP expired",
        message: "Your OTP has expired. Please request a new one."
      });
    }

    // Update hospital to mark as verified
    const operations = [
      { op: "replace", path: "/emailVerified", value: true },
      { op: "remove", path: "/otp" },
      { op: "remove", path: "/otpExpiry" }
    ];

    await container.item(hospital_id, hospital_id).patch(operations);

    console.log("  ✅ Email verified successfully");

    // Send welcome email
    try {
      await sendWelcomeEmail(email, hospital.hospitalName);
    } catch (emailError) {
      console.error('⚠️ Failed to send welcome email:', emailError.message);
      // Continue even if welcome email fails
    }

    // Generate JWT token
    const token = generateToken(hospital_id);

    res.status(200).json({
      success: true,
      message: "Email verified successfully! You can now log in.",
      data: {
        hospital_id: hospital.hospital_id,
        email: hospital.email,
        hospitalName: hospital.hospitalName,
        emailVerified: true,
        token: token,
      },
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({ error: "Verification failed", details: error.message });
  }
});

// Resend OTP
app.post("/api/auth/resend-otp", async (req, res) => {
  try {
    const { hospital_id, email } = req.body;

    console.log("\nResend OTP request:");
    console.log("  Hospital ID:", hospital_id);
    console.log("  Email:", email);

    // Validation
    if (!hospital_id || !email) {
      return res.status(400).json({ error: "Hospital ID and email are required" });
    }

    // Find hospital
    const { resource: hospital } = await container.item(hospital_id, hospital_id).read();

    if (!hospital) {
      return res.status(404).json({ error: "Hospital not found" });
    }

    // Check if already verified
    if (hospital.emailVerified) {
      return res.status(400).json({ 
        error: "Email already verified",
        message: "You can now log in to your account"
      });
    }

    // Generate new OTP
    const newOTP = generateOTP();
    const newOTPExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update hospital with new OTP
    const operations = [
      { op: "replace", path: "/otp", value: newOTP },
      { op: "replace", path: "/otpExpiry", value: newOTPExpiry.toISOString() }
    ];

    await container.item(hospital_id, hospital_id).patch(operations);

    // Send OTP email
    try {
      await sendOTPEmail(email, newOTP, hospital.hospitalName);
      console.log(`✅ New OTP sent to ${email}`);
    } catch (emailError) {
      console.error('❌ Failed to send OTP email:', emailError.message);
      return res.status(500).json({ 
        error: "Failed to send OTP email",
        details: emailError.message 
      });
    }

    res.status(200).json({
      success: true,
      message: "New OTP sent to your email. Please check your inbox.",
    });
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({ error: "Failed to resend OTP", details: error.message });
  }
});

// Get Hospital Profile
app.get("/api/hospitals/:hospital_id", async (req, res) => {
  try {
    const { hospital_id } = req.params;

    // Read directly using id and partition key
    const { resource: hospital } = await container.item(hospital_id, hospital_id).read();

    if (!hospital) {
      return res.status(404).json({ error: "Hospital not found" });
    }

    // Don't send password
    delete hospital.password;

    res.status(200).json({
      success: true,
      data: hospital,
    });
  } catch (error) {
    console.error("Get hospital error:", error);
    res.status(500).json({ error: "Failed to get hospital", details: error.message });
  }
});

// Get Hospital Profile with Stats (for profile page)
app.get("/api/hospital/profile", async (req, res) => {
  try {
    const { hospital_id } = req.query;

    console.log("🔍 Hospital profile request for:", hospital_id);

    if (!hospital_id) {
      return res.status(400).json({ error: "hospital_id query parameter required" });
    }

    // Read directly from the container using id and partition key
    // This is more efficient than querying when we know the partition key
    const { resource: hospital } = await container.item(hospital_id, hospital_id).read();
    
    if (!hospital) {
      return res.status(404).json({ error: "Hospital not found" });
    }

    console.log("🔍 Found hospital:", hospital.hospitalName);

    // Don't send password
    delete hospital.password;

    // Get stats from SQL
    let stats = { totalDonors: 0, totalDonations: 0, availableUnits: 0 };
    try {
      const connection = await getConnection();
      const request = connection.request();
      request.input("hospital_id", sql.VarChar(10), hospital_id);

      const donorCountResult = await request.query(`
        SELECT COUNT(*) AS total_donors FROM donors WHERE hospital_id = @hospital_id
      `);

      const donationCountResult = await connection.request()
        .input("hospital_id", sql.VarChar(10), hospital_id)
        .query(`SELECT COUNT(*) AS total_donations FROM donations WHERE hospital_id = @hospital_id`);

      const availableUnitsResult = await connection.request()
        .input("hospital_id", sql.VarChar(10), hospital_id)
        .query(`
          SELECT COUNT(*) AS available_units 
          FROM donations 
          WHERE hospital_id = @hospital_id 
            AND status = 'available' 
            AND expiry_date > GETDATE()
        `);

      stats = {
        totalDonors: donorCountResult.recordset[0]?.total_donors || 0,
        totalDonations: donationCountResult.recordset[0]?.total_donations || 0,
        availableUnits: availableUnitsResult.recordset[0]?.available_units || 0,
      };
    } catch (sqlError) {
      console.warn("Could not fetch SQL stats:", sqlError.message);
    }

    res.status(200).json({
      success: true,
      data: {
        hospital_id: hospital.hospital_id,
        name: hospital.hospitalName,
        email: hospital.email,
        phone: hospital.phone,
        address: hospital.address,
        city: hospital.city,
        state: hospital.state,
        postal_code: null,
        created_at: hospital.createdAt || null,
        accountType: "Hospital",
        stats,
      },
    });
  } catch (error) {
    console.error("Get hospital profile error:", error);
    res.status(500).json({ error: "Failed to get hospital profile", details: error.message });
  }
});

// Get Blood Requests for a Hospital (NORMALIZED - 3NF)
app.get("/api/hospital/requests", async (req, res) => {
  try {
    const { hospital_id, status } = req.query;

    if (!hospital_id) {
      return res.status(400).json({ error: "hospital_id query parameter required" });
    }

    const connection = await getConnection();
    const request = connection.request();
    request.input("hospital_id", sql.VarChar(10), hospital_id);

    let query = `
      SELECT 
        br.request_id,
        br.requester_id,
        br.patient_name,
        br.patient_age,
        br.blood_type,
        br.urgency,
        br.units_needed,
        br.contact_number,
        br.address,
        br.medical_notes,
        br.status AS request_status,
        br.created_at,
        r.email AS requester_email,
        r.full_name AS requester_name,
        r.phone AS requester_phone,
        rh.hospital_id,
        h.name AS hospital_name,
        rh.status AS hospital_status,
        rh.responded_at,
        rh.notes AS hospital_notes
      FROM blood_requests br
      LEFT JOIN requesters r ON br.requester_id = r.requester_id
      INNER JOIN request_hospitals rh ON br.request_id = rh.request_id
      LEFT JOIN hospitals h ON rh.hospital_id = h.hospital_id
      WHERE rh.hospital_id = @hospital_id
    `;

    if (status) {
      query += ` AND rh.status = @status`;
      request.input("status", sql.VarChar(50), status);
    }

    query += ` ORDER BY 
      CASE br.urgency 
        WHEN 'critical' THEN 1 
        WHEN 'urgent' THEN 2 
        WHEN 'routine' THEN 3 
        ELSE 4 
      END,
      br.created_at DESC`;

    const result = await request.query(query);

    res.status(200).json({
      success: true,
      count: result.recordset.length,
      data: result.recordset,
    });
  } catch (error) {
    console.error("Get hospital requests error:", error);
    res.status(500).json({ error: "Failed to get hospital requests", details: error.message });
  }
});

// Update Blood Request Status (NORMALIZED - 3NF)
app.put("/api/hospital/requests/:request_id/status", async (req, res) => {
  try {
    const { request_id } = req.params;
    const { hospital_id, status, notes } = req.body;

    if (!hospital_id || !status) {
      return res.status(400).json({ error: "hospital_id and status are required" });
    }

    const validStatuses = ["pending", "approved", "rejected", "fulfilled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    }

    const connection = await getConnection();
    
    // Check if request-hospital mapping exists
    const checkRequest = connection.request();
    checkRequest.input("request_id", sql.UniqueIdentifier, request_id);
    checkRequest.input("hospital_id", sql.VarChar(10), hospital_id);
    
    const checkResult = await checkRequest.query(`
      SELECT id FROM request_hospitals
      WHERE request_id = @request_id AND hospital_id = @hospital_id
    `);

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ error: "Request not found or hospital not authorized" });
    }

    // Update the hospital's response in the junction table
    const updateRequest = connection.request();
    updateRequest.input("request_id", sql.UniqueIdentifier, request_id);
    updateRequest.input("hospital_id", sql.VarChar(10), hospital_id);
    updateRequest.input("status", sql.NVarChar(50), status);
    updateRequest.input("notes", sql.NVarChar(500), notes || null);
    updateRequest.input("responded_at", sql.DateTime, new Date());

    await updateRequest.query(`
      UPDATE request_hospitals
      SET 
        status = @status,
        notes = @notes,
        responded_at = @responded_at,
        updated_at = GETDATE()
      WHERE request_id = @request_id AND hospital_id = @hospital_id
    `);

    // Determine overall request status
    let overallStatus = "pending";
    
    if (status === "approved" || status === "fulfilled") {
      overallStatus = status;
      
      // Get list of other hospitals before deleting
      const getOthersRequest = connection.request();
      getOthersRequest.input("request_id", sql.UniqueIdentifier, request_id);
      getOthersRequest.input("hospital_id", sql.VarChar(10), hospital_id);
      
      const othersResult = await getOthersRequest.query(`
        SELECT hospital_id FROM request_hospitals
        WHERE request_id = @request_id 
          AND hospital_id != @hospital_id 
          AND status = 'pending'
      `);
      
      const otherHospitals = othersResult.recordset.map(r => r.hospital_id);
      
      // When one hospital approves, delete all other pending requests for other hospitals
      const deleteOthersRequest = connection.request();
      deleteOthersRequest.input("request_id", sql.UniqueIdentifier, request_id);
      deleteOthersRequest.input("hospital_id", sql.VarChar(10), hospital_id);
      
      await deleteOthersRequest.query(`
        DELETE FROM request_hospitals
        WHERE request_id = @request_id 
          AND hospital_id != @hospital_id 
          AND status = 'pending'
      `);
      
      // Update Firebase cache for other hospitals whose requests were removed
      for (const hid of otherHospitals) {
        await incrementCounter(hid, 'pendingRequests', -1);
      }
      
      // Update main request status
      console.log(`Updating blood_requests status to '${overallStatus}' for request_id=${request_id}`);
      const updateMainRequest = connection.request();
      updateMainRequest.input("request_id", sql.UniqueIdentifier, request_id);
      updateMainRequest.input("status", sql.VarChar(20), overallStatus);
      
      await updateMainRequest.query(`
        UPDATE blood_requests
        SET status = @status
        WHERE request_id = @request_id
      `);
      console.log(`Successfully updated blood_requests status to '${overallStatus}'`);
      
      // Update Firebase cache when approving a request
      if (status === 'approved') {
        // Decrement pending requests (moved from pending to approved)
        await incrementCounter(hospital_id, 'pendingRequests', -1);
        // Increment pending transfers (now waiting for physical transfer)
        await incrementCounter(hospital_id, 'pendingTransfers', 1);
      }
      
      // Emit socket event to other hospitals
      const io = req.app.get('io');
      otherHospitals.forEach(hid => {
        io.to(`hospital-${hid}`).emit('request-removed', { 
          request_id,
          reason: status === 'approved' ? 'approved_by_other' : 'fulfilled_by_other'
        });
      });
      
      // Emit to requester about status change
      const getRequesterReq = connection.request();
      getRequesterReq.input("request_id", sql.UniqueIdentifier, request_id);
      const reqResult = await getRequesterReq.query(`
        SELECT requester_id FROM blood_requests WHERE request_id = @request_id
      `);
      if (reqResult.recordset.length > 0) {
        io.emit('request-status-update', {
          requester_id: reqResult.recordset[0].requester_id,
          request_id,
          status,
          hospital_id
        });
      }
    } else if (status === "rejected") {
      // Update Firebase cache: decrement pending requests
      await incrementCounter(hospital_id, 'pendingRequests', -1);
      
      // Check if all hospitals rejected
      const checkOthersRequest = connection.request();
      checkOthersRequest.input("request_id", sql.UniqueIdentifier, request_id);
      
      const othersResult = await checkOthersRequest.query(`
        SELECT COUNT(*) as pending_count
        FROM request_hospitals
        WHERE request_id = @request_id 
          AND status NOT IN ('rejected')
      `);
      
      if (othersResult.recordset[0].pending_count === 0) {
        overallStatus = "rejected";
        
        const updateMainRequest = connection.request();
        updateMainRequest.input("request_id", sql.UniqueIdentifier, request_id);
        updateMainRequest.input("status", sql.VarChar(20), overallStatus);
        
        await updateMainRequest.query(`
          UPDATE blood_requests
          SET status = @status
          WHERE request_id = @request_id
        `);
      }
      
      // Emit to requester about rejection
      const io = req.app.get('io');
      const getRequesterReq = connection.request();
      getRequesterReq.input("request_id", sql.UniqueIdentifier, request_id);
      const reqResult = await getRequesterReq.query(`
        SELECT requester_id FROM blood_requests WHERE request_id = @request_id
      `);
      if (reqResult.recordset.length > 0) {
        io.emit('request-status-update', {
          requester_id: reqResult.recordset[0].requester_id,
          request_id,
          status: 'rejected',
          hospital_id
        });
      }
    }

    res.status(200).json({ 
      success: true, 
      message: status === "approved" 
        ? "Request approved successfully!"
        : status === "rejected"
        ? "Request rejected and removed from your list."
        : status === "fulfilled"
        ? "Request marked as fulfilled!"
        : `Hospital response recorded as ${status}`,
      data: {
        hospitalStatus: status,
        overallRequestStatus: overallStatus,
      }
    });
  } catch (error) {
    console.error("Update request status error:", error);
    res.status(500).json({ error: "Failed to update request status", details: error.message });
  }
});

// Get available donations for transfer (matching compatible blood types)
app.get("/api/hospital/donations/available", async (req, res) => {
  try {
    const { hospital_id, blood_type, blood_types } = req.query;

    if (!hospital_id) {
      return res.status(400).json({ error: "hospital_id is required" });
    }

    const connection = await getConnection();
    const request = connection.request();
    request.input("hospital_id", sql.VarChar(10), hospital_id);

    let query = `
      SELECT 
        d.blood_id,
        d.donor_id,
        d.blood_type,
        d.rh_factor,
        d.component_type,
        d.volume_ml,
        d.collection_date,
        d.expiry_date,
        d.status,
        CONCAT(dn.first_name, ' ', dn.last_name) AS donor_name
      FROM donations d
      LEFT JOIN donors dn ON d.donor_id = dn.donor_id
      WHERE d.hospital_id = @hospital_id
        AND d.status = 'available'
        AND d.expiry_date > GETDATE()
    `;

    // Handle multiple blood types (comma-separated) or single blood type
    if (blood_types) {
      const typesArray = blood_types.split(",").map(t => t.trim());
      // Build conditions to match (blood_type AND rh_factor) for each compatible type
      const conditions = typesArray.map((t, index) => {
        const typePart = t.replace(/[+-]/g, '');
        const rhPart = t.includes('+') ? '+' : '-';
        
        request.input(`bt_${index}`, sql.VarChar(5), typePart);
        request.input(`rf_${index}`, sql.VarChar(1), rhPart);
        
        return `(d.blood_type = @bt_${index} AND d.rh_factor = @rf_${index})`;
      });
      query += ` AND (${conditions.join(" OR ")})`;
    } else if (blood_type) {
      const typePart = blood_type.replace(/[+-]/g, '');
      const rhPart = blood_type.includes('+') ? '+' : '-';
      
      request.input("bt_single", sql.VarChar(5), typePart);
      request.input("rf_single", sql.VarChar(1), rhPart);
      query += ` AND (d.blood_type = @bt_single AND d.rh_factor = @rf_single)`;
    }

    query += ` ORDER BY d.expiry_date ASC`;

    const result = await request.query(query);

    res.status(200).json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.error("Get available donations error:", error);
    res.status(500).json({ error: "Failed to get available donations", details: error.message });
  }
});

// Create transfer - move donation to transfers table and mark request as fulfilled
app.post("/api/hospital/transfers", async (req, res) => {
  try {
    const { 
      blood_id, 
      request_id, 
      hospital_id,
      notes 
    } = req.body;

    if (!blood_id || !request_id || !hospital_id) {
      return res.status(400).json({ 
        error: "blood_id, request_id, and hospital_id are required" 
      });
    }

    const connection = await getConnection();

    // 1. Get the donation details
    const getDonationRequest = connection.request();
    getDonationRequest.input("blood_id", sql.VarChar(50), blood_id);
    getDonationRequest.input("hospital_id", sql.VarChar(10), hospital_id);

    const donationResult = await getDonationRequest.query(`
      SELECT * FROM donations 
      WHERE blood_id = @blood_id AND hospital_id = @hospital_id AND status = 'available'
    `);

    if (donationResult.recordset.length === 0) {
      return res.status(404).json({ error: "Donation not found or not available" });
    }

    const donation = donationResult.recordset[0];

    // 2. Insert into transfers table (3NF compliant - only foreign keys and transfer-specific data)
    const insertTransferRequest = connection.request();
    insertTransferRequest.input("blood_id", sql.VarChar(50), blood_id);
    insertTransferRequest.input("request_id", sql.UniqueIdentifier, request_id);
    insertTransferRequest.input("hospital_id", sql.VarChar(10), hospital_id);
    insertTransferRequest.input("notes", sql.NVarChar(500), notes || null);

    await insertTransferRequest.query(`
      INSERT INTO transfers (
        blood_id, request_id, hospital_id, notes
      ) VALUES (
        @blood_id, @request_id, @hospital_id, @notes
      )
    `);

    // 3. Update donation status to 'transferred' instead of deleting (maintains 3NF)
    const updateDonationRequest = connection.request();
    updateDonationRequest.input("blood_id", sql.VarChar(50), blood_id);
    
    await updateDonationRequest.query(`
      UPDATE donations 
      SET status = 'transferred', updated_at = GETDATE()
      WHERE blood_id = @blood_id
    `);

    // 4. Update request_hospitals status to fulfilled for this specific hospital
    const updateRequestRequest = connection.request();
    updateRequestRequest.input("request_id", sql.UniqueIdentifier, request_id);
    updateRequestRequest.input("hospital_id", sql.VarChar(10), hospital_id);

    await updateRequestRequest.query(`
      UPDATE request_hospitals 
      SET status = 'fulfilled', responded_at = GETDATE()
      WHERE request_id = @request_id AND hospital_id = @hospital_id
    `);

    // 5. Update blood_requests status to fulfilled
    const updateBloodRequestRequest = connection.request();
    updateBloodRequestRequest.input("request_id", sql.UniqueIdentifier, request_id);

    await updateBloodRequestRequest.query(`
      UPDATE blood_requests 
      SET status = 'fulfilled'
      WHERE request_id = @request_id
    `);

    // Update Firebase cache: decrement pending transfers (approved -> fulfilled) and update inventory
    await incrementCounter(hospital_id, 'pendingTransfers', -1);
    await incrementCounter(hospital_id, 'totalBloodUnits', -1);
    await updateBloodInventory(hospital_id, `${donation.blood_type}${donation.rh_factor}`, -donation.volume_ml);

    // Fetch donor information to send thank you email
    try {
      const getDonorRequest = connection.request();
      getDonorRequest.input("donor_id", sql.Int, donation.donor_id);

      const donorResult = await getDonorRequest.query(`
        SELECT donor_id, first_name, last_name, email 
        FROM donors 
        WHERE donor_id = @donor_id
      `);

      if (donorResult.recordset.length > 0) {
        const donor = donorResult.recordset[0];
        if (donor.email) {
          const donorFullName = `${donor.first_name} ${donor.last_name}`;
          const bloodTypeDisplay = `${donation.blood_type}${donation.rh_factor}`;
          
          // Send thank you email (non-blocking - don't wait for it)
          sendDonorThankYouEmail(
            donor.email,
            donorFullName,
            blood_id,
            bloodTypeDisplay,
            donation.component_type,
            donation.volume_ml
          ).catch(err => {
            console.error('Email notification failed, but transfer completed:', err.message);
          });
          
          console.log(`📧 Sending thank you email to ${donor.email} for blood transfer ${blood_id}`);
        } else {
          console.log(`⚠️ No email found for donor ${donation.donor_id}`);
        }
      }
    } catch (emailError) {
      // Log the error but don't fail the transfer
      console.error('⚠️ Failed to send donor notification email:', emailError.message);
    }

    res.status(201).json({
      success: true,
      message: "Blood transfer completed successfully",
      data: {
        blood_id,
        request_id,
        blood_type: donation.blood_type,
        component_type: donation.component_type,
        volume_ml: donation.volume_ml,
      },
    });
  } catch (error) {
    console.error("Create transfer error:", error);
    res.status(500).json({ error: "Failed to create transfer", details: error.message });
  }
});

// Get transfer history for a hospital
app.get("/api/hospital/transfers", async (req, res) => {
  try {
    const { hospital_id } = req.query;

    if (!hospital_id) {
      return res.status(400).json({ error: "hospital_id is required" });
    }

    const connection = await getConnection();
    const request = connection.request();
    request.input("hospital_id", sql.VarChar(10), hospital_id);

    const result = await request.query(`
      SELECT 
        t.transfer_id,
        t.blood_id,
        t.request_id,
        t.hospital_id,
        t.transfer_date,
        t.notes,
        t.created_at,
        -- Blood details from donations table (3NF compliant)
        d.donor_id,
        d.blood_type,
        d.rh_factor,
        d.component_type,
        d.volume_ml,
        -- Patient details from blood_requests table (3NF compliant)
        br.patient_name,
        br.blood_type AS requested_blood_type,
        br.urgency
      FROM transfers t
      LEFT JOIN donations d ON t.blood_id = d.blood_id
      LEFT JOIN blood_requests br ON t.request_id = br.request_id
      WHERE t.hospital_id = @hospital_id
      ORDER BY t.transfer_date DESC
    `);

    res.status(200).json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.error("Get transfers error:", error);
    res.status(500).json({ error: "Failed to get transfers", details: error.message });
  }
});

// Reset Password
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    
    console.log("Reset password request received:");
    console.log("  Email received:", JSON.stringify(email));
    console.log("  Email length:", email ? email.length : 0);

    // Validation
    if (!email || !newPassword) {
      return res.status(400).json({ error: "Email and new password required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // First, get all hospitals to debug
    const allQuery = "SELECT * FROM c";
    const { resources: allHospitals } = await container.items.query(allQuery).fetchAll();
    console.log("  Total hospitals in DB:", allHospitals.length);
    allHospitals.forEach((h, i) => {
      console.log(`    Hospital ${i}: email="${h.email}", match=${h.email === email}`);
    });

    // Find hospital by exact email match
    let hospital = null;
    for (const h of allHospitals) {
      if (h.email === email) {
        hospital = h;
        break;
      }
    }

    if (!hospital) {
      console.log("  No matching hospital found!");
      return res.status(404).json({ error: "Hospital not found with this email" });
    }

    console.log("  Found hospital:", hospital.email);

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password in Cosmos DB using the document ID and partition key
    hospital.password = hashedPassword;
    await container
      .item(hospital.hospital_id, hospital.hospital_id)
      .replace(hospital);

    console.log("  Password reset successfully for:", hospital.email);

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
      data: {
        hospital_id: hospital.hospital_id,
        email: hospital.email,
      },
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Password reset failed", details: error.message });
  }
});

// Health Check
// Health check endpoint for load balancers and monitoring
app.get("/api/health", async (req, res) => {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: require('./package.json').version,
    services: {
      sql: false,
      cosmos: false,
      firebase: false
    }
  };

  // Check SQL connection
  try {
    const conn = await getConnection();
    await conn.request().query('SELECT 1');
    health.services.sql = true;
  } catch (err) {
    health.services.sql = false;
  }

  // Check Cosmos (if initialized)
  if (container && database) {
    health.services.cosmos = true;
  }

  // Check Firebase (simple check - if config exists)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    health.services.firebase = true;
  }

  const allHealthy = health.services.sql || health.services.cosmos;
  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json(health);
});

// Simple ping endpoint for basic health checks
app.get("/ping", (req, res) => {
  res.status(200).send("pong");
});

// Webhook: Notification from blood-connect when requester deletes a request
app.post("/api/webhook/request-deleted", async (req, res) => {
  try {
    const { request_id, status } = req.body;

    if (!request_id) {
      return res.status(400).json({ error: "request_id is required" });
    }

    console.log(`📡 Webhook: Request ${request_id} deleted by requester (status: ${status})`);

    // Emit socket event to all connected hospitals
    io.emit('request-removed', { 
      request_id,
      reason: status === 'fulfilled' ? 'deleted_by_requester_fulfilled' : 'deleted_by_requester'
    });

    res.status(200).json({ success: true, message: "Notification sent to hospitals" });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Failed to process webhook", details: error.message });
  }
});

app.post("/api/webhook/request-created", async (req, res) => {
  try {
    const { request_id, hospital_ids } = req.body;

    if (!request_id || !Array.isArray(hospital_ids)) {
      return res.status(400).json({ error: "request_id and hospital_ids array are required" });
    }

    console.log(`📡 Webhook: New request ${request_id} created for ${hospital_ids.length} hospitals`);

    // Remove duplicates from hospital_ids to avoid incrementing counter multiple times
    const uniqueHospitalIds = [...new Set(hospital_ids)];
    
    console.log(`📡 Unique hospitals: ${uniqueHospitalIds.length} (${hospital_ids.length - uniqueHospitalIds.length} duplicates removed)`);

    // Update Firebase cache for each unique hospital
    for (const hospital_id of uniqueHospitalIds) {
      await incrementCounter(hospital_id, 'pendingRequests', 1);
    }

    // Emit socket event to specific hospitals
    uniqueHospitalIds.forEach(hospital_id => {
      io.to(`hospital-${hospital_id}`).emit('new-request', { 
        request_id,
        message: 'New blood request available'
      });
    });

    res.status(200).json({ success: true, message: "Hospitals notified" });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Failed to process webhook", details: error.message });
  }
});

// Blood Management Routes (Donors & Donations/Inventory using SQL)
app.use("/api", bloodRoutes);

// DEBUG: Get all hospitals (remove in production)
app.get("/api/debug/all-hospitals", async (req, res) => {
  try {
    const query = "SELECT * FROM c";
    const { resources } = await container.items.query(query).fetchAll();
    res.status(200).json({
      count: resources.length,
      hospitals: resources.map((h) => ({
        hospital_id: h.hospital_id,
        email: h.email,
        email_length: h.email ? h.email.length : 0,
        email_bytes: h.email ? Buffer.from(h.email).toString('hex') : null,
        hospitalName: h.hospitalName,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  
  // Join hospital-specific room
  socket.on('join-hospital', (hospitalId) => {
    socket.join(`hospital-${hospitalId}`);
    console.log(`🏥 Socket ${socket.id} joined hospital-${hospitalId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

async function startServer() {
  try {
    await initializeCosmos();
    await initializeSQL();
    server.listen(PORT, () => {
      console.log(`🚀 Blood Bank API running on http://localhost:${PORT}`);
      console.log(`🔌 Socket.IO ready for real-time updates`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
