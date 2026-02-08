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

(async () => {
  try {
    console.log('🔧 Connecting to Azure SQL...');
    const pool = new sql.ConnectionPool(config);
    await pool.connect();
    console.log('✅ Connected');
    
    console.log('\n📝 Adding blood details columns to transfers table...');
    
    // Add donor_id column
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'transfers' AND COLUMN_NAME = 'donor_id'
      )
      BEGIN
        ALTER TABLE transfers ADD donor_id INT NULL;
        PRINT 'Added donor_id column';
      END
    `);
    
    // Add blood_type column
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'transfers' AND COLUMN_NAME = 'blood_type'
      )
      BEGIN
        ALTER TABLE transfers ADD blood_type VARCHAR(5) NULL;
        PRINT 'Added blood_type column';
      END
    `);
    
    // Add rh_factor column
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'transfers' AND COLUMN_NAME = 'rh_factor'
      )
      BEGIN
        ALTER TABLE transfers ADD rh_factor VARCHAR(1) NULL;
        PRINT 'Added rh_factor column';
      END
    `);
    
    // Add component_type column
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'transfers' AND COLUMN_NAME = 'component_type'
      )
      BEGIN
        ALTER TABLE transfers ADD component_type NVARCHAR(50) NULL;
        PRINT 'Added component_type column';
      END
    `);
    
    // Add volume_ml column
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'transfers' AND COLUMN_NAME = 'volume_ml'
      )
      BEGIN
        ALTER TABLE transfers ADD volume_ml INT NULL;
        PRINT 'Added volume_ml column';
      END
    `);
    
    console.log('✅ All columns added successfully');
    
    // Check the new structure
    const columnsResult = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'transfers'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('\n📋 New transfers table structure:');
    console.table(columnsResult.recordset);
    
    await pool.close();
    console.log('\n✅ Migration completed successfully!');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
