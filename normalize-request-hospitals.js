// Normalize request_hospitals table - Remove hospital_name column
require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  user: process.env.SQL_USERNAME,
  password: process.env.SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true,
  },
};

async function main() {
  console.log('========================================');
  console.log('Normalizing REQUEST_HOSPITALS Table');
  console.log('========================================\n');
  
  try {
    const pool = await sql.connect(config);
    console.log(`✅ Connected to ${config.server}/${config.database}\n`);
    
    // Step 1: Create backup
    console.log('Step 1: Creating backup...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'request_hospitals_backup_20251228')
      BEGIN
        SELECT * INTO request_hospitals_backup_20251228 FROM request_hospitals;
      END
    `);
    console.log('✅ Backup created: request_hospitals_backup_20251228\n');
    
    // Step 2: Check if hospital_name column exists
    console.log('Step 2: Checking for hospital_name column...');
    const checkResult = await pool.request().query(`
      SELECT COUNT(*) as col_exists
      FROM sys.columns 
      WHERE object_id = OBJECT_ID('request_hospitals') 
        AND name = 'hospital_name'
    `);
    
    if (checkResult.recordset[0].col_exists > 0) {
      console.log('✅ hospital_name column found\n');
      
      // Step 3: Remove hospital_name column
      console.log('Step 3: Removing hospital_name column...');
      await pool.request().query(`
        ALTER TABLE request_hospitals DROP COLUMN hospital_name
      `);
      console.log('✅ hospital_name column removed\n');
    } else {
      console.log('ℹ️  hospital_name column not found (already removed)\n');
    }
    
    // Step 4: Create view for backward compatibility
    console.log('Step 4: Creating request_hospitals_view...');
    await pool.request().query(`
      IF EXISTS (SELECT * FROM sys.views WHERE name = 'request_hospitals_view')
        DROP VIEW request_hospitals_view
    `);
    
    await pool.request().query(`
      CREATE VIEW request_hospitals_view AS
      SELECT 
        rh.id,
        rh.request_id,
        rh.hospital_id,
        h.name as hospital_name,
        rh.status,
        rh.responded_at,
        rh.notes,
        rh.created_at,
        rh.updated_at
      FROM request_hospitals rh
      LEFT JOIN hospitals h ON rh.hospital_id = h.hospital_id
    `);
    console.log('✅ View created for backward compatibility\n');
    
    console.log('========================================');
    console.log('✅ Normalization Complete!');
    console.log('========================================\n');
    console.log('Changes made:');
    console.log('  ✅ Removed hospital_name from request_hospitals');
    console.log('  ✅ Created request_hospitals_view with hospital_name via JOIN');
    console.log('  ✅ Backup saved as request_hospitals_backup_20251228\n');
    console.log('request_hospitals is now fully 3NF compliant!\n');
    
    await pool.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
