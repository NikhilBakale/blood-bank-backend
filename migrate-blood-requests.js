const sql = require('mssql');
require('dotenv').config();

const config = {
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  authentication: {
    type: 'default',
    options: {
      userName: process.env.SQL_USERNAME,
      password: process.env.SQL_PASSWORD,
    }
  },
  options: {
    encrypt: true,
    trustServerCertificate: false,
  }
};

async function migrateData() {
  let pool;
  try {
    console.log('🔌 Connecting to database...');
    pool = await sql.connect(config);
    console.log('✅ Connected successfully\n');
    
    // Step 1: Create new table (if not exists)
    console.log('📋 Step 1: Creating request_hospitals table...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'request_hospitals')
      BEGIN
        CREATE TABLE request_hospitals (
          id INT PRIMARY KEY IDENTITY(1,1),
          request_id UNIQUEIDENTIFIER NOT NULL,
          hospital_id VARCHAR(10) NOT NULL,
          hospital_name NVARCHAR(255) NULL,
          status NVARCHAR(50) DEFAULT 'pending',
          responded_at DATETIME NULL,
          notes NVARCHAR(500) NULL,
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT FK_request_hospitals_requests 
            FOREIGN KEY (request_id) REFERENCES blood_requests(request_id) ON DELETE CASCADE,
          CONSTRAINT FK_request_hospitals_hospitals 
            FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id),
          CONSTRAINT UQ_request_hospital UNIQUE (request_id, hospital_id)
        );
        
        CREATE INDEX idx_request_hospitals_hospital_id ON request_hospitals(hospital_id);
        CREATE INDEX idx_request_hospitals_request_id ON request_hospitals(request_id);
        CREATE INDEX idx_request_hospitals_status ON request_hospitals(status);
        
        PRINT 'Table created successfully';
      END
      ELSE
      BEGIN
        PRINT 'Table already exists';
      END
    `);
    console.log('✅ Table ready\n');
    
    // Step 2: Fetch all requests with selected_hospitals
    console.log('📋 Step 2: Fetching existing data...');
    const result = await pool.request().query(`
      SELECT request_id, selected_hospitals
      FROM blood_requests
      WHERE selected_hospitals IS NOT NULL 
        AND selected_hospitals != ''
        AND selected_hospitals != '[]'
    `);
    
    console.log(`📊 Found ${result.recordset.length} requests to migrate\n`);
    
    if (result.recordset.length === 0) {
      console.log('ℹ️  No data to migrate. All done!');
      return;
    }
    
    // Step 3: Parse and insert data
    console.log('📋 Step 3: Migrating data...');
    let successCount = 0;
    let errorCount = 0;
    let totalHospitals = 0;
    
    for (const row of result.recordset) {
      try {
        const hospitals = JSON.parse(row.selected_hospitals);
        
        if (!Array.isArray(hospitals)) {
          console.warn(`  ⚠️  Request ${row.request_id}: selected_hospitals is not an array`);
          errorCount++;
          continue;
        }
        
        totalHospitals += hospitals.length;
        
        for (const hospital of hospitals) {
          try {
            // Check if mapping already exists
            const exists = await pool.request()
              .input('request_id', sql.UniqueIdentifier, row.request_id)
              .input('hospital_id', sql.VarChar(10), hospital.hospital_id)
              .query(`
                SELECT COUNT(*) as count 
                FROM request_hospitals 
                WHERE request_id = @request_id AND hospital_id = @hospital_id
              `);
            
            if (exists.recordset[0].count > 0) {
              console.log(`  ⏭️  Skipping duplicate: Request ${row.request_id} → Hospital ${hospital.hospital_id}`);
              successCount++;
              continue;
            }
            
            // Insert new mapping
            await pool.request()
              .input('request_id', sql.UniqueIdentifier, row.request_id)
              .input('hospital_id', sql.VarChar(10), hospital.hospital_id)
              .input('hospital_name', sql.NVarChar(255), hospital.hospital_name || hospital.hospitalName || null)
              .input('status', sql.NVarChar(50), hospital.status || 'pending')
              .input('responded_at', sql.DateTime, hospital.respondedAt ? new Date(hospital.respondedAt) : null)
              .query(`
                INSERT INTO request_hospitals (
                  request_id, hospital_id, hospital_name, status, responded_at
                ) VALUES (
                  @request_id, @hospital_id, @hospital_name, @status, @responded_at
                )
              `);
            
            successCount++;
            process.stdout.write(`\r  ✅ Migrated: ${successCount}/${totalHospitals} hospital mappings`);
          } catch (err) {
            console.error(`\n  ❌ Error inserting hospital ${hospital.hospital_id}:`, err.message);
            errorCount++;
          }
        }
      } catch (err) {
        console.error(`\n  ❌ Error parsing JSON for request ${row.request_id}:`, err.message);
        console.error(`     Data: ${row.selected_hospitals.substring(0, 100)}...`);
        errorCount++;
      }
    }
    
    console.log('\n');
    console.log('═'.repeat(60));
    console.log('✅ Migration complete!');
    console.log(`   Successful: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log('═'.repeat(60));
    console.log('');
    
    // Step 4: Verify migration
    console.log('📋 Step 4: Verifying data integrity...\n');
    
    const verification = await pool.request().query(`
      SELECT 
        (SELECT COUNT(*) FROM blood_requests WHERE selected_hospitals IS NOT NULL AND selected_hospitals != '' AND selected_hospitals != '[]') AS original_count,
        (SELECT COUNT(DISTINCT request_id) FROM request_hospitals) AS migrated_requests,
        (SELECT COUNT(*) FROM request_hospitals) AS total_mappings
    `);
    
    const stats = verification.recordset[0];
    console.log(`   Original requests with hospitals: ${stats.original_count}`);
    console.log(`   Migrated unique requests: ${stats.migrated_requests}`);
    console.log(`   Total hospital mappings: ${stats.total_mappings}`);
    console.log('');
    
    // Check for orphaned requests
    const orphans = await pool.request().query(`
      SELECT br.request_id, br.patient_name
      FROM blood_requests br
      LEFT JOIN request_hospitals rh ON br.request_id = rh.request_id
      WHERE br.selected_hospitals IS NOT NULL 
        AND br.selected_hospitals != ''
        AND br.selected_hospitals != '[]'
        AND rh.id IS NULL
    `);
    
    if (orphans.recordset.length > 0) {
      console.log(`   ⚠️  Warning: ${orphans.recordset.length} requests not migrated:`);
      orphans.recordset.forEach(r => {
        console.log(`      - ${r.request_id}: ${r.patient_name}`);
      });
    } else {
      console.log('   ✅ No orphaned requests found');
    }
    
    console.log('');
    
    if (stats.original_count === stats.migrated_requests && errorCount === 0) {
      console.log('═'.repeat(60));
      console.log('✅ ✅ ✅ MIGRATION SUCCESSFUL!');
      console.log('═'.repeat(60));
      console.log('');
      console.log('📊 Sample migrated data:');
      
      const sample = await pool.request().query(`
        SELECT TOP 3
          br.request_id,
          br.patient_name,
          rh.hospital_id,
          rh.hospital_name,
          rh.status,
          rh.responded_at
        FROM blood_requests br
        JOIN request_hospitals rh ON br.request_id = rh.request_id
        ORDER BY rh.created_at DESC
      `);
      
      console.table(sample.recordset);
      
      console.log('');
      console.log('⚠️  NEXT STEPS:');
      console.log('   1. Update your application code (see NORMALIZATION_FIX_GUIDE.md)');
      console.log('   2. Test all request-related functionality thoroughly');
      console.log('   3. After confirming everything works, run:');
      console.log('');
      console.log('      ALTER TABLE blood_requests DROP COLUMN selected_hospitals;');
      console.log('');
      console.log('   4. Your database will then be in proper 3NF! 🎉');
      console.log('');
    } else {
      console.log('⚠️  Warning: Verification shows potential issues.');
      console.log('   Please review the data manually before proceeding.');
      console.log('   DO NOT drop the selected_hospitals column yet!');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('');
    console.error('Stack trace:', error.stack);
    throw error;
  } finally {
    if (pool) {
      await pool.close();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run migration
console.log('═'.repeat(60));
console.log('🔧 Blood Requests Normalization Migration');
console.log('═'.repeat(60));
console.log('');

migrateData()
  .then(() => {
    console.log('');
    console.log('🎉 Migration script completed successfully!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('');
    console.error('💥 Fatal error during migration:', err.message);
    console.error('');
    console.error('⚠️  Your database is unchanged. It is safe to try again.');
    process.exit(1);
  });
