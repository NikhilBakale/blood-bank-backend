const express = require("express");
const { getConnection, sql } = require("../db/sqlConnection");
const { getDashboardStats, rebuildDashboardCache, incrementCounter, updateBloodInventory } = require("../services/firebaseCache");
const router = express.Router();

// Generate unique blood_id
function generateBloodId() {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `BLD-${timestamp}-${random}`;
}

// GET: Hospital profile/info
router.get("/hospital/profile", async (req, res) => {
  try {
    const { hospital_id } = req.query;

    if (!hospital_id) {
      return res.status(400).json({
        error: "hospital_id query parameter required",
      });
    }

    const connection = await getConnection();
    const request = connection.request();
    request.input("hospital_id", sql.VarChar(10), hospital_id);

    const result = await request.query(`
      SELECT 
        hospital_id,
        name,
        address,
        city,
        state,
        postal_code,
        phone,
        email,
        created_at
      FROM hospitals
      WHERE hospital_id = @hospital_id
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        error: "Hospital not found",
      });
    }

    const hospital = result.recordset[0];

    // Get additional stats
    const statsRequest = connection.request();
    statsRequest.input("hospital_id", sql.VarChar(10), hospital_id);

    const donorCountResult = await statsRequest.query(`
      SELECT COUNT(*) AS total_donors FROM donors WHERE hospital_id = @hospital_id
    `);

    const donationCountResult = await statsRequest.query(`
      SELECT COUNT(*) AS total_donations FROM donations WHERE hospital_id = @hospital_id
    `);

    const availableUnitsResult = await statsRequest.query(`
      SELECT COUNT(*) AS available_units 
      FROM donations 
      WHERE hospital_id = @hospital_id 
        AND status = 'available' 
        AND expiry_date > GETDATE()
    `);

    res.status(200).json({
      success: true,
      data: {
        ...hospital,
        accountType: "Hospital",
        stats: {
          totalDonors: donorCountResult.recordset[0]?.total_donors || 0,
          totalDonations: donationCountResult.recordset[0]?.total_donations || 0,
          availableUnits: availableUnitsResult.recordset[0]?.available_units || 0,
        },
      },
    });
  } catch (error) {
    console.error("Get hospital profile error:", error);
    res.status(500).json({
      error: "Failed to retrieve hospital profile",
      details: error.message,
    });
  }
});

// POST: Create new donor
router.post("/donors", async (req, res) => {
  try {
    const {
      hospital_id,
      first_name,
      last_name,
      date_of_birth,
      gender,
      phone,
      email,
      address,
      city,
      state,
      postal_code,
    } = req.body;

    // Validation
    if (!hospital_id || !first_name || !last_name || !date_of_birth || !gender) {
      return res.status(400).json({
        error: "Missing required fields: hospital_id, first_name, last_name, date_of_birth, gender",
      });
    }

    // DEBUG: Log received address fields and hospital_id
    console.log('🏥 Received hospital_id:', hospital_id);
    console.log('📍 Received address data:', { 
      postal_code, 
      city, 
      state, 
      address,
      has_postal: !!postal_code,
      has_city: !!city,
      has_state: !!state
    });

    const connection = await getConnection();
    
    // Verify hospital exists
    const hospitalCheck = await connection.request()
      .input("hospital_id", sql.VarChar(10), hospital_id)
      .query(`SELECT hospital_id FROM hospitals WHERE hospital_id = @hospital_id`);
    
    if (hospitalCheck.recordset.length === 0) {
      console.error(`❌ Hospital ${hospital_id} does not exist in hospitals table`);
      return res.status(400).json({
        error: `Hospital ID ${hospital_id} not found. Please ensure the hospital is registered.`,
      });
    }
    console.log(`✓ Hospital ${hospital_id} exists`);
    
    // If postal_code, city, and state are provided, ensure postal_code exists in postal_codes table
    if (postal_code && city && state) {
      console.log('✓ All address fields present, checking postal_codes table...');
      const checkPostalRequest = connection.request();
      checkPostalRequest.input("postal_code", sql.VarChar(10), postal_code);
      
      const postalExists = await checkPostalRequest.query(`
        SELECT postal_code FROM postal_codes WHERE postal_code = @postal_code
      `);
      
      // If postal code doesn't exist, insert it
      if (postalExists.recordset.length === 0) {
        console.log(`📝 Inserting new postal code: ${postal_code}, ${city}, ${state}`);
        
        const insertPostalRequest = connection.request();
        insertPostalRequest.input("postal_code", sql.VarChar(10), postal_code);
        insertPostalRequest.input("city", sql.NVarChar(100), city);
        insertPostalRequest.input("state", sql.VarChar(50), state);
        
        await insertPostalRequest.query(`
          INSERT INTO postal_codes (postal_code, city, state)
          VALUES (@postal_code, @city, @state)
        `);
        
        console.log(`✅ Added new postal code: ${postal_code}, ${city}, ${state}`);
      } else {
        console.log(`✓ Postal code ${postal_code} already exists in database`);
      }
    } else {
      console.log('⚠️ Skipping postal_codes insert - missing city, state, or postal_code');
    }
    
    const request = connection.request();

    request.input("hospital_id", sql.VarChar(10), hospital_id);
    request.input("first_name", sql.NVarChar(100), first_name);
    request.input("last_name", sql.NVarChar(100), last_name);
    request.input("date_of_birth", sql.Date, date_of_birth);
    request.input("gender", sql.VarChar(10), gender);
    request.input("phone", sql.VarChar(20), phone || null);
    request.input("email", sql.NVarChar(100), email || null);
    request.input("address", sql.NVarChar(255), address || null);
    request.input("postal_code", sql.VarChar(10), postal_code || null);

    const result = await request.query(`
      INSERT INTO donors (hospital_id, first_name, last_name, date_of_birth, gender, phone, email, address, postal_code)
      VALUES (@hospital_id, @first_name, @last_name, @date_of_birth, @gender, @phone, @email, @address, @postal_code);
      SELECT SCOPE_IDENTITY() as donor_id;
    `);

    console.log("SQL Insert result:", result);
    
    if (!result.recordset || !result.recordset[0]) {
      throw new Error("Failed to retrieve inserted donor ID");
    }

    const donor_id = result.recordset[0].donor_id;
    console.log("Created donor with ID:", donor_id);

    // Update Firebase cache: increment donor count
    await incrementCounter(hospital_id, 'registeredDonors', 1);

    res.status(201).json({
      success: true,
      message: "Donor created successfully",
      data: {
        donor_id,
        first_name,
        last_name,
        email,
      },
    });
  } catch (error) {
    console.error("Create donor error:", error);
    res.status(500).json({
      error: "Failed to create donor",
      details: error.message,
    });
  }
});

// POST: Create new donation (blood inventory record)
router.post("/donations", async (req, res) => {
  try {
    const {
      donor_id,
      hospital_id,
      blood_type,
      rh_factor,
      component_type,
      volume_ml,
      collection_date,
      expiry_date,
      storage_location,
      test_result_hiv,
      test_result_hbsag,
      test_result_hcv,
      test_result_syphilis,
    } = req.body;

    console.log("📝 Donation creation request received:", {
      donor_id,
      hospital_id,
      blood_type,
      rh_factor,
      component_type,
      volume_ml,
      collection_date,
      expiry_date,
    });

    // Validation
    if (!donor_id || !hospital_id || !blood_type || !rh_factor || !component_type || !volume_ml || !collection_date || !expiry_date) {
      console.error("❌ Missing required fields");
      return res.status(400).json({
        error: "Missing required fields",
        missing: {
          donor_id: !donor_id,
          hospital_id: !hospital_id,
          blood_type: !blood_type,
          rh_factor: !rh_factor,
          component_type: !component_type,
          volume_ml: !volume_ml,
          collection_date: !collection_date,
          expiry_date: !expiry_date,
        },
      });
    }

    if (volume_ml <= 0) {
      console.error("❌ Invalid volume:", volume_ml);
      return res.status(400).json({
        error: "Volume must be greater than 0",
      });
    }

    const connection = await getConnection();
    const request = connection.request();

    const blood_id = generateBloodId();

    request.input("blood_id", sql.NVarChar(50), blood_id);
    request.input("donor_id", sql.Int, donor_id);
    request.input("hospital_id", sql.VarChar(10), hospital_id);
    request.input("blood_type", sql.VarChar(5), blood_type);
    request.input("rh_factor", sql.VarChar(1), rh_factor);
    request.input("component_type", sql.NVarChar(50), component_type);
    request.input("volume_ml", sql.Int, volume_ml);
    request.input("collection_date", sql.DateTime, new Date(collection_date));
    request.input("expiry_date", sql.DateTime, new Date(expiry_date));
    request.input("storage_location", sql.NVarChar(100), storage_location || null);
    request.input("test_result_hiv", sql.VarChar(20), test_result_hiv || null);
    request.input("test_result_hbsag", sql.VarChar(20), test_result_hbsag || null);
    request.input("test_result_hcv", sql.VarChar(20), test_result_hcv || null);
    request.input("test_result_syphilis", sql.VarChar(20), test_result_syphilis || null);

    await request.query(`
      INSERT INTO donations (
        blood_id, donor_id, hospital_id, blood_type, rh_factor, component_type,
        volume_ml, collection_date, expiry_date, storage_location,
        test_result_hiv, test_result_hbsag, test_result_hcv, test_result_syphilis, status
      )
      VALUES (
        @blood_id, @donor_id, @hospital_id, @blood_type, @rh_factor, @component_type,
        @volume_ml, @collection_date, @expiry_date, @storage_location,
        @test_result_hiv, @test_result_hbsag, @test_result_hcv, @test_result_syphilis, 'available'
      );
    `);

    // Update Firebase cache: increment total units and update blood inventory
    await incrementCounter(hospital_id, 'totalBloodUnits', 1);
    await updateBloodInventory(hospital_id, `${blood_type}${rh_factor}`, volume_ml);

    res.status(201).json({
      success: true,
      message: "Donation recorded successfully",
      data: {
        blood_id,
        donor_id,
        blood_type: `${blood_type}${rh_factor}`,
        component_type,
        volume_ml,
        collection_date,
        expiry_date,
      },
    });
  } catch (error) {
    console.error("Create donation error:", error);
    res.status(500).json({
      error: "Failed to create donation",
      details: error.message,
    });
  }
});

// GET: List all donors for a hospital
router.get("/donors", async (req, res) => {
  try {
    const { hospital_id } = req.query;

    if (!hospital_id) {
      return res.status(400).json({
        error: "hospital_id query parameter required",
      });
    }

    const connection = await getConnection();
    const request = connection.request();

    request.input("hospital_id", sql.VarChar(10), hospital_id);

    const result = await request.query(`
      SELECT 
        donor_id, hospital_id, first_name, last_name, date_of_birth,
        gender, phone, email, address, city, state, postal_code, created_at
      FROM donors_view
      WHERE hospital_id = @hospital_id
      ORDER BY created_at DESC
    `);

    res.status(200).json({
      success: true,
      count: result.recordset.length,
      data: result.recordset,
    });
  } catch (error) {
    console.error("Get donors error:", error);
    res.status(500).json({
      error: "Failed to retrieve donors",
      details: error.message,
    });
  }
});

// GET: List all donations (blood inventory) for a hospital
router.get("/donations", async (req, res) => {
  try {
    const { hospital_id, status } = req.query;

    if (!hospital_id) {
      return res.status(400).json({
        error: "hospital_id query parameter required",
      });
    }

    const connection = await getConnection();
    const request = connection.request();

    request.input("hospital_id", sql.VarChar(10), hospital_id);

    let query = `
      SELECT 
        d.blood_id, d.donor_id, do.first_name, do.last_name,
        d.blood_type, d.rh_factor, d.component_type, d.volume_ml,
        d.collection_date, d.expiry_date, d.status, d.storage_location,
        DATEDIFF(DAY, GETDATE(), d.expiry_date) AS days_until_expiry,
        d.created_at
      FROM donations d
      INNER JOIN donors do ON d.donor_id = do.donor_id
      WHERE d.hospital_id = @hospital_id
    `;

    if (status) {
      query += ` AND d.status = @status`;
      request.input("status", sql.VarChar(20), status);
    }

    query += ` ORDER BY d.collection_date DESC`;

    const result = await request.query(query);

    res.status(200).json({
      success: true,
      count: result.recordset.length,
      data: result.recordset,
    });
  } catch (error) {
    console.error("Get donations error:", error);
    res.status(500).json({
      error: "Failed to retrieve donations",
      details: error.message,
    });
  }
});

// GET: Get donor details with donation history
router.get("/donors/:donor_id", async (req, res) => {
  try {
    const { donor_id } = req.params;

    const connection = await getConnection();
    const request = connection.request();

    request.input("donor_id", sql.Int, donor_id);

    const result = await request.query(`
      SELECT 
        donor_id, hospital_id, first_name, last_name, date_of_birth,
        gender, phone, email, address, city, state, postal_code, created_at
      FROM donors
      WHERE donor_id = @donor_id
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        error: "Donor not found",
      });
    }

    const donor = result.recordset[0];

    // Get donation history
    const donationRequest = connection.request();
    donationRequest.input("donor_id", sql.Int, donor_id);

    const donationResult = await donationRequest.query(`
      SELECT 
        blood_id, blood_type, rh_factor, component_type, volume_ml,
        collection_date, expiry_date, status, created_at
      FROM donations
      WHERE donor_id = @donor_id
      ORDER BY collection_date DESC
    `);

    res.status(200).json({
      success: true,
      data: {
        donor,
        donations: donationResult.recordset,
      },
    });
  } catch (error) {
    console.error("Get donor details error:", error);
    res.status(500).json({
      error: "Failed to retrieve donor details",
      details: error.message,
    });
  }
});

// GET: Dashboard statistics for a hospital
router.get("/dashboard/stats", async (req, res) => {
  try {
    const { hospital_id, force_refresh } = req.query;

    if (!hospital_id) {
      return res.status(400).json({
        error: "hospital_id query parameter required",
      });
    }

    // Try Firebase cache first (unless force_refresh is true)
    if (force_refresh !== 'true') {
      const cachedStats = await getDashboardStats(hospital_id);
      
      if (cachedStats) {
        console.log(`📊 Dashboard stats served from Firebase cache for ${hospital_id}`);
        return res.status(200).json({
          success: true,
          cached: true,
          data: {
            stats: {
              totalUnits: cachedStats.totalBloodUnits || 0,
              totalVolume: cachedStats.totalBloodUnits || 0,
              donorCount: cachedStats.registeredDonors || 0,
              pendingTransfers: cachedStats.pendingTransfers || 0,
              urgentRequests: cachedStats.urgentRequests || 0,
              pendingRequests: cachedStats.pendingRequests || 0,
            },
            bloodTypeInventory: cachedStats.bloodInventory || {},
          },
        });
      }
    }

    // Fallback to SQL if cache miss or force refresh
    console.log(`📊 Dashboard stats loading from SQL for ${hospital_id}`);
    const connection = await getConnection();
    
    // Rebuild cache from SQL
    const stats = await rebuildDashboardCache(hospital_id, connection);

    res.status(200).json({
      success: true,
      cached: false,
      data: {
        stats: {
          totalUnits: stats.totalBloodUnits || 0,
          totalVolume: stats.totalBloodUnits || 0,
          donorCount: stats.registeredDonors || 0,
          pendingTransfers: stats.pendingTransfers || 0,
          urgentRequests: stats.urgentRequests || 0,
          pendingRequests: stats.pendingRequests || 0,
        },
        bloodTypeInventory: stats.bloodInventory || {},
      },
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({
      error: "Failed to retrieve dashboard statistics",
      details: error.message,
    });
  }
});

// GET: Blood requests sent to this hospital by requesters (NORMALIZED - 3NF)
router.get("/requests", async (req, res) => {
  try {
    const { hospital_id, status } = req.query;

    if (!hospital_id) {
      return res.status(400).json({
        error: "hospital_id query parameter required",
      });
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
        rh.hospital_name,
        rh.status AS hospital_status,
        rh.responded_at,
        rh.notes AS hospital_notes
      FROM blood_requests br
      LEFT JOIN requesters r ON br.requester_id = r.requester_id
      INNER JOIN request_hospitals rh ON br.request_id = rh.request_id
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
    console.error("Get blood requests error:", error);
    res.status(500).json({
      error: "Failed to retrieve blood requests",
      details: error.message,
    });
  }
});

// PUT: Update request status (approve/reject/fulfill) - NORMALIZED 3NF
router.put("/requests/:request_id/status", async (req, res) => {
  try {
    const { request_id } = req.params;
    const { hospital_id, status, notes } = req.body;

    if (!hospital_id || !status) {
      return res.status(400).json({
        error: "hospital_id and status are required",
      });
    }

    const validStatuses = ["pending", "approved", "rejected", "fulfilled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
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
      return res.status(404).json({
        error: "Request not found or hospital not authorized",
      });
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
      
      // Update main request status
      const updateMainRequest = connection.request();
      updateMainRequest.input("request_id", sql.UniqueIdentifier, request_id);
      updateMainRequest.input("status", sql.VarChar(20), overallStatus);
      
      await updateMainRequest.query(`
        UPDATE blood_requests
        SET status = @status
        WHERE request_id = @request_id
      `);
    } else if (status === "rejected") {
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
    }

    // Update Firebase cache after status change
    if (status === "approved" || status === "rejected") {
      // Decrement pending requests for this hospital
      await incrementCounter(hospital_id, 'pendingRequests', -1);
      
      // If approved, increment pending transfers
      if (status === "approved") {
        await incrementCounter(hospital_id, 'pendingTransfers', 1);
      }
      
      // Get the request to check urgency
      const urgencyRequest = connection.request();
      urgencyRequest.input("request_id", sql.UniqueIdentifier, request_id);
      const urgencyResult = await urgencyRequest.query(`
        SELECT urgency FROM blood_requests WHERE request_id = @request_id
      `);
      
      if (urgencyResult.recordset.length > 0) {
        const urgency = urgencyResult.recordset[0].urgency;
        if (urgency === 'critical' || urgency === 'urgent') {
          await incrementCounter(hospital_id, 'urgentRequests', -1);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: `Hospital response recorded as ${status}`,
      data: {
        hospitalStatus: status,
        overallRequestStatus: overallStatus,
      },
    });
  } catch (error) {
    console.error("Update request status error:", error);
    res.status(500).json({
      error: "Failed to update request status",
      details: error.message,
    });
  }
});

// POST: Webhook for external systems to trigger cache updates (called by blood-connect)
router.post("/cache/notify-new-request", async (req, res) => {
  try {
    const { hospital_id, request_id, urgency } = req.body;
    
    if (!hospital_id || !request_id) {
      return res.status(400).json({ error: "hospital_id and request_id are required" });
    }
    
    // Increment pending requests counter
    await incrementCounter(hospital_id, 'pendingRequests', 1);
    
    // If urgent/critical, increment urgent counter
    if (urgency === 'critical' || urgency === 'urgent') {
      await incrementCounter(hospital_id, 'urgentRequests', 1);
    }
    
    res.status(200).json({ success: true, message: "Cache updated" });
  } catch (error) {
    console.error("Cache notify error:", error);
    res.status(500).json({ error: "Failed to update cache" });
  }
});

// GET: Low stock blood types (below threshold)
router.get("/hospital/low-stock", async (req, res) => {
  try {
    const { hospital_id, threshold = 5 } = req.query;

    if (!hospital_id) {
      return res.status(400).json({
        error: "hospital_id query parameter required",
      });
    }

    const connection = await getConnection();
    const request = connection.request();
    request.input("hospital_id", sql.VarChar(10), hospital_id);
    request.input("threshold", sql.Int, parseInt(threshold));

    const result = await request.query(`
      SELECT 
        d.blood_type,
        d.rh_factor,
        COUNT(*) AS unit_count,
        SUM(d.volume_ml) AS total_volume_ml,
        MIN(d.expiry_date) AS earliest_expiry
      FROM donations d
      WHERE d.hospital_id = @hospital_id
        AND d.status = 'available'
        AND d.expiry_date > GETDATE()
      GROUP BY d.blood_type, d.rh_factor
      HAVING COUNT(*) < @threshold
      ORDER BY unit_count ASC
    `);

    const lowStockItems = result.recordset.map(row => ({
      bloodType: `${row.blood_type}${row.rh_factor}`,
      unitCount: row.unit_count,
      totalVolumeMl: row.total_volume_ml,
      earliestExpiry: row.earliest_expiry,
    }));

    res.status(200).json({
      success: true,
      data: lowStockItems,
    });
  } catch (error) {
    console.error("Low stock fetch error:", error);
    res.status(500).json({
      error: "Failed to retrieve low stock data",
      details: error.message,
    });
  }
});

// GET: Expiring blood units (within specified days)
router.get("/hospital/expiring-blood", async (req, res) => {
  try {
    const { hospital_id, days = 7 } = req.query;

    if (!hospital_id) {
      return res.status(400).json({
        error: "hospital_id query parameter required",
      });
    }

    const connection = await getConnection();
    const request = connection.request();
    request.input("hospital_id", sql.VarChar(10), hospital_id);
    request.input("days", sql.Int, parseInt(days));

    const result = await request.query(`
      SELECT 
        d.blood_id,
        d.blood_type,
        d.rh_factor,
        d.component_type,
        d.volume_ml,
        d.expiry_date,
        d.collection_date,
        d.storage_location,
        DATEDIFF(DAY, GETDATE(), d.expiry_date) AS days_until_expiry,
        donor.first_name,
        donor.last_name
      FROM donations d
      LEFT JOIN donors donor ON d.donor_id = donor.donor_id
      WHERE d.hospital_id = @hospital_id
        AND d.status = 'available'
        AND d.expiry_date > GETDATE()
        AND DATEDIFF(DAY, GETDATE(), d.expiry_date) <= @days
      ORDER BY d.expiry_date ASC
    `);

    const expiringBlood = result.recordset.map(row => ({
      bloodId: row.blood_id,
      bloodType: `${row.blood_type}${row.rh_factor}`,
      componentType: row.component_type,
      volumeMl: row.volume_ml,
      expiryDate: row.expiry_date,
      collectionDate: row.collection_date,
      storageLocation: row.storage_location,
      daysUntilExpiry: row.days_until_expiry,
      donorName: row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : null,
    }));

    res.status(200).json({
      success: true,
      data: expiringBlood,
    });
  } catch (error) {
    console.error("Expiring blood fetch error:", error);
    res.status(500).json({
      error: "Failed to retrieve expiring blood data",
      details: error.message,
    });
  }
});

// GET: Inventory analytics - donor trends, donations over time, component breakdown
router.get("/hospital/analytics", async (req, res) => {
  try {
    const { hospital_id, days = 30 } = req.query;

    if (!hospital_id) {
      return res.status(400).json({
        error: "hospital_id query parameter required",
      });
    }

    const connection = await getConnection();
    const request = connection.request();
    request.input("hospital_id", sql.VarChar(10), hospital_id);
    request.input("days", sql.Int, parseInt(days));

    // 1. Donations per day (last N days)
    const donationsPerDayResult = await request.query(`
      SELECT 
        CAST(d.collection_date AS DATE) AS date,
        COUNT(*) AS count,
        SUM(d.volume_ml) AS total_volume
      FROM donations d
      WHERE d.hospital_id = @hospital_id
        AND d.collection_date >= DATEADD(DAY, -@days, GETDATE())
      GROUP BY CAST(d.collection_date AS DATE)
      ORDER BY date ASC
    `);

    // 2. Component type distribution (current available)
    const componentRequest = connection.request();
    componentRequest.input("hospital_id", sql.VarChar(10), hospital_id);
    const componentResult = await componentRequest.query(`
      SELECT 
        d.component_type,
        COUNT(*) AS unit_count,
        SUM(d.volume_ml) AS total_volume
      FROM donations d
      WHERE d.hospital_id = @hospital_id
        AND d.status = 'available'
        AND d.expiry_date > GETDATE()
      GROUP BY d.component_type
      ORDER BY unit_count DESC
    `);

    // 3. Blood type trends (donations per blood type over time)
    const bloodTypeTrendRequest = connection.request();
    bloodTypeTrendRequest.input("hospital_id", sql.VarChar(10), hospital_id);
    bloodTypeTrendRequest.input("days", sql.Int, parseInt(days));
    const bloodTypeTrendResult = await bloodTypeTrendRequest.query(`
      SELECT 
        CAST(d.collection_date AS DATE) AS date,
        d.blood_type,
        d.rh_factor,
        COUNT(*) AS count
      FROM donations d
      WHERE d.hospital_id = @hospital_id
        AND d.collection_date >= DATEADD(DAY, -@days, GETDATE())
      GROUP BY CAST(d.collection_date AS DATE), d.blood_type, d.rh_factor
      ORDER BY date ASC
    `);

    // 4. Expiring blood by blood type (within 7 days)
    const expiringByTypeRequest = connection.request();
    expiringByTypeRequest.input("hospital_id", sql.VarChar(10), hospital_id);
    const expiringByTypeResult = await expiringByTypeRequest.query(`
      SELECT 
        d.blood_type,
        d.rh_factor,
        COUNT(*) AS expiring_units,
        SUM(d.volume_ml) AS expiring_volume,
        MIN(DATEDIFF(DAY, GETDATE(), d.expiry_date)) AS min_days_left,
        MAX(DATEDIFF(DAY, GETDATE(), d.expiry_date)) AS max_days_left
      FROM donations d
      WHERE d.hospital_id = @hospital_id
        AND d.status = 'available'
        AND d.expiry_date > GETDATE()
        AND DATEDIFF(DAY, GETDATE(), d.expiry_date) <= 7
      GROUP BY d.blood_type, d.rh_factor
      ORDER BY expiring_units DESC
    `);

    // 5. Donor registration trends
    const donorTrendRequest = connection.request();
    donorTrendRequest.input("hospital_id", sql.VarChar(10), hospital_id);
    donorTrendRequest.input("days", sql.Int, parseInt(days));
    const donorTrendResult = await donorTrendRequest.query(`
      SELECT 
        CAST(created_at AS DATE) AS date,
        COUNT(*) AS new_donors
      FROM donors
      WHERE hospital_id = @hospital_id
        AND created_at >= DATEADD(DAY, -@days, GETDATE())
      GROUP BY CAST(created_at AS DATE)
      ORDER BY date ASC
    `);

    // Format data for response
    const donationsPerDay = donationsPerDayResult.recordset.map(row => ({
      date: row.date,
      count: row.count,
      volume: row.total_volume,
    }));

    const componentDistribution = componentResult.recordset.map(row => ({
      componentType: row.component_type,
      unitCount: row.unit_count,
      totalVolume: row.total_volume,
    }));

    const bloodTypeTrends = bloodTypeTrendResult.recordset.map(row => ({
      date: row.date,
      bloodType: `${row.blood_type}${row.rh_factor}`,
      count: row.count,
    }));

    const expiringByBloodType = expiringByTypeResult.recordset.map(row => ({
      bloodType: `${row.blood_type}${row.rh_factor}`,
      expiringUnits: row.expiring_units,
      expiringVolume: row.expiring_volume,
      minDaysLeft: row.min_days_left,
      maxDaysLeft: row.max_days_left,
    }));

    const donorRegistrations = donorTrendResult.recordset.map(row => ({
      date: row.date,
      newDonors: row.new_donors,
    }));

    res.status(200).json({
      success: true,
      data: {
        donationsPerDay,
        componentDistribution,
        bloodTypeTrends,
        expiringByBloodType,
        donorRegistrations,
      },
    });
  } catch (error) {
    console.error("Analytics fetch error:", error);
    res.status(500).json({
      error: "Failed to retrieve analytics data",
      details: error.message,
    });
  }
});

module.exports = router;
