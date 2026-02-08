const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");

// Cosmos DB container (to be injected from server.js)
let donorContainer = null;

function setDonorContainer(container) {
  donorContainer = container;
}

// Helper function to generate blood ID
function generateBloodId() {
  return `BLD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Calculate expiry date based on component type (FDA/AABB medical standards)
function calculateExpiryDate(collectionDate, componentType) {
  const date = new Date(collectionDate);
  let days = 35; // Default for whole blood (CPDA-1 anticoagulant)

  // Set shelf life according to medical standards
  if (componentType === "Whole Blood") days = 35;
  else if (componentType === "Red Blood Cells") days = 42;
  else if (componentType === "Platelets") days = 5;
  else if (componentType === "Fresh Frozen Plasma") days = 365;
  else if (componentType === "Cryoprecipitate") days = 365;

  date.setDate(date.getDate() + days);
  return date.toISOString();
}

// POST - Create a new donor
router.post("/donors", async (req, res) => {
  try {
    if (!donorContainer) {
      return res.status(503).json({ error: "Database not initialized" });
    }

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
    if (!hospital_id || !first_name || !last_name || !date_of_birth) {
      return res.status(400).json({
        error: "Missing required fields: hospital_id, first_name, last_name, date_of_birth",
      });
    }

    const donor = {
      id: uuidv4(),
      type: "donor",
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const response = await donorContainer.items.create(donor);

    res.status(201).json({
      success: true,
      message: "Donor created successfully",
      data: {
        donor_id: response.resource.id,
        ...response.resource,
      },
    });
  } catch (error) {
    console.error("Create donor error:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST - Record a blood donation
router.post("/donations", async (req, res) => {
  try {
    if (!donorContainer) {
      return res.status(503).json({ error: "Database not initialized" });
    }

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
    } = req.body;

    // Validation
    if (!donor_id || !hospital_id || !blood_type || !component_type || !volume_ml || !collection_date) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    if (volume_ml <= 0) {
      return res.status(400).json({ error: "Volume must be greater than 0" });
    }

    const blood_id = generateBloodId();
    const calculatedExpiry = calculateExpiryDate(collection_date, component_type);

    const donation = {
      id: uuidv4(),
      type: "donation",
      blood_id,
      donor_id,
      hospital_id,
      blood_type,
      rh_factor,
      component_type,
      volume_ml,
      collection_date,
      expiry_date: expiry_date || calculatedExpiry,
      status: "available",
      storage_location,
      test_result_hiv: null,
      test_result_hbsag: null,
      test_result_hcv: null,
      test_result_syphilis: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const response = await donorContainer.items.create(donation);

    res.status(201).json({
      success: true,
      message: "Donation recorded successfully",
      data: response.resource,
    });
  } catch (error) {
    console.error("Create donation error:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET - List all donors for a hospital
router.get("/donors", async (req, res) => {
  try {
    if (!donorContainer) {
      return res.status(503).json({ error: "Database not initialized" });
    }

    const { hospital_id } = req.query;

    if (!hospital_id) {
      return res.status(400).json({ error: "hospital_id query parameter is required" });
    }

    const query = "SELECT * FROM c WHERE c.type = 'donor' AND c.hospital_id = @hospital_id ORDER BY c.created_at DESC";
    const { resources } = await donorContainer.items.query(query, {
      parameters: [{ name: "@hospital_id", value: hospital_id }],
    }).fetchAll();

    res.json({
      success: true,
      count: resources.length,
      data: resources,
    });
  } catch (error) {
    console.error("Get donors error:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET - List all donations for a hospital with optional status filter
router.get("/donations", async (req, res) => {
  try {
    if (!donorContainer) {
      return res.status(503).json({ error: "Database not initialized" });
    }

    const { hospital_id, status } = req.query;

    if (!hospital_id) {
      return res.status(400).json({ error: "hospital_id query parameter is required" });
    }

    let query = "SELECT * FROM c WHERE c.type = 'donation' AND c.hospital_id = @hospital_id";
    const parameters = [{ name: "@hospital_id", value: hospital_id }];

    if (status) {
      query += " AND c.status = @status";
      parameters.push({ name: "@status", value: status });
    }

    query += " ORDER BY c.collection_date DESC";

    const { resources } = await donorContainer.items.query(query, { parameters }).fetchAll();

    res.json({
      success: true,
      count: resources.length,
      data: resources,
    });
  } catch (error) {
    console.error("Get donations error:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET - Get a specific donor with their donation history
router.get("/donors/:donor_id", async (req, res) => {
  try {
    if (!donorContainer) {
      return res.status(503).json({ error: "Database not initialized" });
    }

    const { donor_id } = req.params;

    // Get donor
    const donorQuery = "SELECT * FROM c WHERE c.type = 'donor' AND c.id = @donor_id";
    const { resources: donors } = await donorContainer.items
      .query(donorQuery, {
        parameters: [{ name: "@donor_id", value: donor_id }],
      })
      .fetchAll();

    if (donors.length === 0) {
      return res.status(404).json({ error: "Donor not found" });
    }

    // Get donations for this donor
    const donationQuery = "SELECT * FROM c WHERE c.type = 'donation' AND c.donor_id = @donor_id ORDER BY c.collection_date DESC";
    const { resources: donations } = await donorContainer.items
      .query(donationQuery, {
        parameters: [{ name: "@donor_id", value: donor_id }],
      })
      .fetchAll();

    res.json({
      success: true,
      data: {
        donor: donors[0],
        donations: donations,
      },
    });
  } catch (error) {
    console.error("Get donor error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = {
  router,
  setDonorContainer,
};
