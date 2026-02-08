// Activate 3NF Changes - Rename tables to make normalized versions active
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
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

async function main() {
  console.log('========================================');
  console.log('Activating 3NF Normalized Tables');
  console.log('========================================\n');
  
  try {
    const pool = await sql.connect(config);
    console.log(`✅ Connected to ${config.server}/${config.database}\n`);
    
    console.log('⚠️  WARNING: This will rename your active tables!');
    console.log('   transfers → transfers_old');
    console.log('   hospitals → hospitals_old');
    console.log('   donors → donors_old\n');
    console.log('   transfers_normalized → transfers');
    console.log('   hospitals_normalized → hospitals');
    console.log('   donors_normalized → donors\n');
    
    // Step 1: Rename transfers
    console.log('Step 1: Renaming transfers table...');
    await pool.request().query(`EXEC sp_rename 'transfers', 'transfers_old'`);
    console.log('✅ transfers → transfers_old\n');
    
    await pool.request().query(`EXEC sp_rename 'transfers_normalized', 'transfers'`);
    console.log('✅ transfers_normalized → transfers\n');
    
    // Step 2: Rename hospitals
    console.log('Step 2: Renaming hospitals table...');
    await pool.request().query(`EXEC sp_rename 'hospitals', 'hospitals_old'`);
    console.log('✅ hospitals → hospitals_old\n');
    
    await pool.request().query(`EXEC sp_rename 'hospitals_normalized', 'hospitals'`);
    console.log('✅ hospitals_normalized → hospitals\n');
    
    // Step 3: Rename donors
    console.log('Step 3: Renaming donors table...');
    await pool.request().query(`EXEC sp_rename 'donors', 'donors_old'`);
    console.log('✅ donors → donors_old\n');
    
    await pool.request().query(`EXEC sp_rename 'donors_normalized', 'donors'`);
    console.log('✅ donors_normalized → donors\n');
    
    // Step 4: Update views to use new table names
    console.log('Step 4: Updating views...');
    
    await pool.request().query(`DROP VIEW IF EXISTS transfers_view`);
    await pool.request().query(`
      CREATE VIEW transfers_view AS
      SELECT 
        t.transfer_id, t.blood_id, t.request_id, t.hospital_id,
        d.donor_id, d.blood_type, d.rh_factor, d.component_type, d.volume_ml,
        t.recipient_name, t.recipient_contact, t.transfer_date, t.notes, t.created_at
      FROM transfers t
      LEFT JOIN donations d ON t.blood_id = d.blood_id
    `);
    console.log('✅ transfers_view updated\n');
    
    await pool.request().query(`DROP VIEW IF EXISTS hospitals_view`);
    await pool.request().query(`
      CREATE VIEW hospitals_view AS
      SELECT 
        h.hospital_id, h.name, h.address,
        pc.city, pc.state, h.postal_code,
        h.phone, h.email, h.created_at, h.updated_at
      FROM hospitals h
      LEFT JOIN postal_codes pc ON h.postal_code = pc.postal_code
    `);
    console.log('✅ hospitals_view updated\n');
    
    await pool.request().query(`DROP VIEW IF EXISTS donors_view`);
    await pool.request().query(`
      CREATE VIEW donors_view AS
      SELECT 
        d.donor_id, d.hospital_id, d.first_name, d.last_name,
        d.date_of_birth, d.gender, d.phone, d.email, d.address,
        pc.city, pc.state, d.postal_code,
        d.created_at, d.updated_at
      FROM donors d
      LEFT JOIN postal_codes pc ON d.postal_code = pc.postal_code
    `);
    console.log('✅ donors_view updated\n');
    
    console.log('========================================');
    console.log('🎉 3NF Activation Complete!');
    console.log('========================================\n');
    console.log('Your database is now fully 3NF compliant!\n');
    console.log('Active tables:');
    console.log('  ✅ transfers (3NF normalized)');
    console.log('  ✅ hospitals (3NF normalized)');
    console.log('  ✅ donors (3NF normalized)');
    console.log('  ✅ postal_codes (lookup table)\n');
    console.log('Old tables preserved as:');
    console.log('  📦 transfers_old');
    console.log('  📦 hospitals_old');
    console.log('  📦 donors_old\n');
    console.log('Your application will now use the normalized structure!\n');
    
    await pool.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nIf tables are already renamed, this is expected.');
    process.exit(1);
  }
}

main();
