require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  authentication: {
    type: "default",
    options: {
      userName: process.env.SQL_USERNAME,
      password: process.env.SQL_PASSWORD,
    }
  },
  options: {
    encrypt: true,
  }
};

async function fixForeignKeys() {
  const pool = await sql.connect(config);
  
  try {
    console.log('=== Fixing Foreign Key Constraints ===\n');
    
    // Step 1: Check current FK constraints
    console.log('Step 1: Checking current FK constraints...');
    const fks = await pool.request().query(`
      SELECT 
        fk.name AS constraint_name,
        OBJECT_NAME(fk.parent_object_id) AS table_name,
        COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS column_name,
        OBJECT_NAME(fk.referenced_object_id) AS referenced_table
      FROM sys.foreign_keys fk
      INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      WHERE OBJECT_NAME(fk.referenced_object_id) IN ('donors_old', 'hospitals_old')
      ORDER BY table_name
    `);
    
    console.log('Foreign keys pointing to *_old tables:');
    fks.recordset.forEach(fk => {
      console.log(`  - ${fk.table_name}.${fk.column_name} -> ${fk.referenced_table} (${fk.constraint_name})`);
    });
    
    // Step 2: Drop FK constraints pointing to old tables
    console.log('\nStep 2: Dropping old FK constraints...');
    for (const fk of fks.recordset) {
      console.log(`  Dropping ${fk.constraint_name} from ${fk.table_name}...`);
      await pool.request().query(`
        ALTER TABLE ${fk.table_name} DROP CONSTRAINT ${fk.constraint_name}
      `);
      console.log(`    ✓ Dropped`);
    }
    
    // Step 3: Recreate FK constraints pointing to current tables
    console.log('\nStep 3: Creating new FK constraints...');
    
    // donors table FK to hospitals
    console.log('  Creating FK: donors.hospital_id -> hospitals.hospital_id...');
    await pool.request().query(`
      ALTER TABLE donors
      ADD CONSTRAINT FK_donors_hospitals
      FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id)
    `);
    console.log('    ✓ Created');
    
    // donors table FK to postal_codes
    console.log('  Creating FK: donors.postal_code -> postal_codes.postal_code...');
    await pool.request().query(`
      ALTER TABLE donors
      ADD CONSTRAINT FK_donors_postal_code
      FOREIGN KEY (postal_code) REFERENCES postal_codes(postal_code)
    `);
    console.log('    ✓ Created');
    
    // donations table FK to donors
    console.log('  Creating FK: donations.donor_id -> donors.donor_id...');
    await pool.request().query(`
      ALTER TABLE donations
      ADD CONSTRAINT FK_donations_donors
      FOREIGN KEY (donor_id) REFERENCES donors(donor_id)
    `);
    console.log('    ✓ Created');
    
    // donations table FK to hospitals
    console.log('  Creating FK: donations.hospital_id -> hospitals.hospital_id...');
    await pool.request().query(`
      ALTER TABLE donations
      ADD CONSTRAINT FK_donations_hospitals
      FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id)
    `);
    console.log('    ✓ Created');
    
    // Step 4: Verify new constraints
    console.log('\nStep 4: Verifying new FK constraints...');
    const newFks = await pool.request().query(`
      SELECT 
        fk.name AS constraint_name,
        OBJECT_NAME(fk.parent_object_id) AS table_name,
        COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS column_name,
        OBJECT_NAME(fk.referenced_object_id) AS referenced_table
      FROM sys.foreign_keys fk
      INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      WHERE OBJECT_NAME(fk.parent_object_id) IN ('donors', 'donations')
      ORDER BY table_name, constraint_name
    `);
    
    console.log('Current FK constraints:');
    newFks.recordset.forEach(fk => {
      console.log(`  ✓ ${fk.table_name}.${fk.column_name} -> ${fk.referenced_table}`);
    });
    
    console.log('\n✅ All FK constraints fixed!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Details:', error);
  } finally {
    await pool.close();
  }
}

fixForeignKeys();
