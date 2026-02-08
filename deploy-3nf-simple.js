// Simple deployment script that executes SQL directly
// This works better with Node.js mssql driver

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

async function deployTransfersNormalization(pool) {
  console.log('\n=== Deploying TRANSFERS Normalization ===\n');
  
  try {
    // Step 1: Create backup
    console.log('Step 1: Creating backup...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'transfers_backup_20251228')
      BEGIN
        SELECT * INTO transfers_backup_20251228 FROM transfers;
        PRINT 'Backup created: transfers_backup_20251228';
      END
    `);
    console.log('✅ Backup created\n');
    
    // Step 2: Create normalized table
    console.log('Step 2: Creating normalized transfers table...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'transfers_normalized')
      BEGIN
        CREATE TABLE transfers_normalized (
          transfer_id INT IDENTITY(1,1) PRIMARY KEY,
          blood_id VARCHAR(50) NOT NULL,
          request_id UNIQUEIDENTIFIER NOT NULL,
          hospital_id VARCHAR(10) NOT NULL,
          recipient_name NVARCHAR(255) NULL,
          recipient_contact VARCHAR(20) NULL,
          transfer_date DATETIME DEFAULT GETDATE(),
          notes NVARCHAR(500) NULL,
          created_at DATETIME DEFAULT GETDATE(),
          FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id),
          FOREIGN KEY (request_id) REFERENCES blood_requests(request_id)
        );
      END
    `);
    console.log('✅ Normalized table created\n');
    
    // Step 3: Create indexes
    console.log('Step 3: Creating indexes...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_transfers_normalized_blood_id')
        CREATE INDEX IX_transfers_normalized_blood_id ON transfers_normalized(blood_id);
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_transfers_normalized_hospital_id')
        CREATE INDEX IX_transfers_normalized_hospital_id ON transfers_normalized(hospital_id);
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_transfers_normalized_request_id')
        CREATE INDEX IX_transfers_normalized_request_id ON transfers_normalized(request_id);
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_transfers_normalized_transfer_date')
        CREATE INDEX IX_transfers_normalized_transfer_date ON transfers_normalized(transfer_date);
    `);
    console.log('✅ Indexes created\n');
    
    // Step 4: Migrate data
    console.log('Step 4: Migrating data...');
    const countResult = await pool.request().query('SELECT COUNT(*) as count FROM transfers');
    const existingCount = countResult.recordset[0].count;
    
    if (existingCount > 0) {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM transfers_normalized)
        BEGIN
          SET IDENTITY_INSERT transfers_normalized ON;
          
          INSERT INTO transfers_normalized (
            transfer_id, blood_id, request_id, hospital_id,
            recipient_name, recipient_contact, transfer_date, notes, created_at
          )
          SELECT 
            transfer_id, blood_id, request_id, hospital_id,
            recipient_name, recipient_contact, transfer_date, notes, created_at
          FROM transfers;
          
          SET IDENTITY_INSERT transfers_normalized OFF;
        END
      `);
      console.log(`✅ Migrated ${existingCount} records\n`);
    } else {
      console.log('✅ No data to migrate (table is empty)\n');
    }
    
    // Step 5: Create view
    console.log('Step 5: Creating backward compatibility view...');
    await pool.request().query(`
      IF EXISTS (SELECT * FROM sys.views WHERE name = 'transfers_view')
        DROP VIEW transfers_view;
    `);
    
    await pool.request().query(`
      CREATE VIEW transfers_view AS
      SELECT 
        t.transfer_id,
        t.blood_id,
        t.request_id,
        t.hospital_id,
        d.donor_id,
        d.blood_type,
        d.rh_factor,
        d.component_type,
        d.volume_ml,
        t.recipient_name,
        t.recipient_contact,
        t.transfer_date,
        t.notes,
        t.created_at
      FROM transfers_normalized t
      LEFT JOIN donations d ON t.blood_id = d.blood_id;
    `);
    console.log('✅ View created\n');
    
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function deployPostalCodes(pool) {
  console.log('\n=== Deploying POSTAL_CODES Normalization ===\n');
  
  try {
    // Step 1: Create postal_codes table
    console.log('Step 1: Creating postal_codes table...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'postal_codes')
      BEGIN
        CREATE TABLE postal_codes (
          postal_code VARCHAR(10) PRIMARY KEY,
          city NVARCHAR(100) NOT NULL,
          state VARCHAR(50) NOT NULL,
          country VARCHAR(50) DEFAULT 'USA',
          created_at DATETIME DEFAULT GETDATE()
        );
        
        CREATE INDEX IX_postal_codes_city ON postal_codes(city);
        CREATE INDEX IX_postal_codes_state ON postal_codes(state);
      END
    `);
    console.log('✅ Table created\n');
    
    // Step 2: Populate from hospitals
    console.log('Step 2: Populating postal codes from hospitals...');
    await pool.request().query(`
      INSERT INTO postal_codes (postal_code, city, state)
      SELECT DISTINCT postal_code, city, state
      FROM hospitals
      WHERE postal_code IS NOT NULL 
        AND city IS NOT NULL 
        AND state IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM postal_codes pc 
          WHERE pc.postal_code = hospitals.postal_code
        );
    `);
    console.log('✅ Populated from hospitals\n');
    
    // Step 3: Populate from donors
    console.log('Step 3: Populating postal codes from donors...');
    await pool.request().query(`
      INSERT INTO postal_codes (postal_code, city, state)
      SELECT DISTINCT postal_code, city, state
      FROM donors
      WHERE postal_code IS NOT NULL 
        AND city IS NOT NULL 
        AND state IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM postal_codes pc 
          WHERE pc.postal_code = donors.postal_code
        );
    `);
    console.log('✅ Populated from donors\n');
    
    // Step 4: Create backups
    console.log('Step 4: Creating backups...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'hospitals_backup_20251228')
        SELECT * INTO hospitals_backup_20251228 FROM hospitals;
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'donors_backup_20251228')
        SELECT * INTO donors_backup_20251228 FROM donors;
    `);
    console.log('✅ Backups created\n');
    
    // Step 5: Create normalized hospitals table
    console.log('Step 5: Creating hospitals_normalized...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'hospitals_normalized')
      BEGIN
        CREATE TABLE hospitals_normalized (
          hospital_id VARCHAR(10) PRIMARY KEY,
          name NVARCHAR(255) NOT NULL,
          address NVARCHAR(500),
          postal_code VARCHAR(10),
          phone VARCHAR(20),
          email VARCHAR(255),
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE(),
          FOREIGN KEY (postal_code) REFERENCES postal_codes(postal_code)
        );
        
        INSERT INTO hospitals_normalized (
          hospital_id, name, address, postal_code, phone, email, created_at, updated_at
        )
        SELECT 
          hospital_id, name, address, postal_code, phone, email, created_at, updated_at
        FROM hospitals;
      END
    `);
    console.log('✅ hospitals_normalized created\n');
    
    // Step 6: Create normalized donors table
    console.log('Step 6: Creating donors_normalized...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'donors_normalized')
      BEGIN
        CREATE TABLE donors_normalized (
          donor_id INT IDENTITY(1,1) PRIMARY KEY,
          hospital_id VARCHAR(10) NOT NULL,
          first_name NVARCHAR(100) NOT NULL,
          last_name NVARCHAR(100) NOT NULL,
          date_of_birth DATE,
          gender VARCHAR(10),
          phone VARCHAR(20),
          email VARCHAR(255),
          address NVARCHAR(500),
          postal_code VARCHAR(10),
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE(),
          FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id),
          FOREIGN KEY (postal_code) REFERENCES postal_codes(postal_code)
        );
        
        SET IDENTITY_INSERT donors_normalized ON;
        
        INSERT INTO donors_normalized (
          donor_id, hospital_id, first_name, last_name, date_of_birth, gender,
          phone, email, address, postal_code, created_at, updated_at
        )
        SELECT 
          donor_id, hospital_id, first_name, last_name, date_of_birth, gender,
          phone, email, address, postal_code, created_at, updated_at
        FROM donors;
        
        SET IDENTITY_INSERT donors_normalized OFF;
      END
    `);
    console.log('✅ donors_normalized created\n');
    
    // Step 7: Create views
    console.log('Step 7: Creating views...');
    await pool.request().query(`
      IF EXISTS (SELECT * FROM sys.views WHERE name = 'hospitals_view')
        DROP VIEW hospitals_view;
    `);
    await pool.request().query(`
      CREATE VIEW hospitals_view AS
      SELECT 
        h.hospital_id, h.name, h.address,
        pc.city, pc.state, h.postal_code,
        h.phone, h.email, h.created_at, h.updated_at
      FROM hospitals_normalized h
      LEFT JOIN postal_codes pc ON h.postal_code = pc.postal_code;
    `);
    
    await pool.request().query(`
      IF EXISTS (SELECT * FROM sys.views WHERE name = 'donors_view')
        DROP VIEW donors_view;
    `);
    await pool.request().query(`
      CREATE VIEW donors_view AS
      SELECT 
        d.donor_id, d.hospital_id, d.first_name, d.last_name,
        d.date_of_birth, d.gender, d.phone, d.email, d.address,
        pc.city, pc.state, d.postal_code,
        d.created_at, d.updated_at
      FROM donors_normalized d
      LEFT JOIN postal_codes pc ON d.postal_code = pc.postal_code;
    `);
    console.log('✅ Views created\n');
    
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('3NF Database Normalization Deployment');
  console.log('========================================\n');
  
  try {
    const pool = await sql.connect(config);
    console.log(`✅ Connected to ${config.server}/${config.database}\n`);
    
    // Deploy TRANSFERS
    const success1 = await deployTransfersNormalization(pool);
    if (!success1) {
      console.log('\n❌ TRANSFERS deployment failed');
      await pool.close();
      process.exit(1);
    }
    
    // Deploy POSTAL_CODES
    const success2 = await deployPostalCodes(pool);
    if (!success2) {
      console.log('\n❌ POSTAL_CODES deployment failed');
      await pool.close();
      process.exit(1);
    }
    
    console.log('\n========================================');
    console.log('✅ Deployment Complete!');
    console.log('========================================\n');
    console.log('Created tables:');
    console.log('  - transfers_normalized');
    console.log('  - hospitals_normalized');
    console.log('  - donors_normalized');
    console.log('  - postal_codes\n');
    console.log('Created views:');
    console.log('  - transfers_view');
    console.log('  - hospitals_view');
    console.log('  - donors_view\n');
    console.log('Next: Run "node test-3nf-migration.js" to verify\n');
    
    await pool.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Connection error:', error.message);
    process.exit(1);
  }
}

main();
