// Deploy 3NF Normalization
// This script deploys the database normalization changes using Node.js

require('dotenv').config();
const sql = require('mssql');
const fs = require('fs').promises;
const readline = require('readline');

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function executeSqlFile(connection, filePath, logPath) {
  try {
    console.log(`Reading SQL file: ${filePath}`);
    const sqlContent = await fs.readFile(filePath, 'utf8');
    
    // Split by GO statements (SQL Server batch separator)
    const batches = sqlContent
      .split(/^\s*GO\s*$/mi)
      .filter(batch => batch.trim().length > 0);
    
    console.log(`Found ${batches.length} SQL batches to execute`);
    
    const logs = [];
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i].trim();
      if (batch.length === 0) continue;
      
      try {
        const result = await connection.request().query(batch);
        
        // Capture PRINT statements
        if (result.recordset && result.recordset.length > 0) {
          logs.push(`Batch ${i + 1} result: ${JSON.stringify(result.recordset[0])}`);
        }
        
        if (result.rowsAffected && result.rowsAffected.length > 0) {
          logs.push(`Batch ${i + 1} affected: ${result.rowsAffected[0]} rows`);
        }
      } catch (err) {
        const error = `Error in batch ${i + 1}: ${err.message}`;
        console.error(error);
        logs.push(error);
        throw err;
      }
    }
    
    // Write logs
    await fs.writeFile(logPath, logs.join('\n'), 'utf8');
    console.log(`✅ Logs written to: ${logPath}`);
    
    return true;
  } catch (error) {
    console.error(`❌ Error executing SQL file: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('3NF Database Normalization Deployment');
  console.log('========================================');
  console.log('');
  
  if (!config.server || !config.database) {
    console.error('❌ Error: SQL_SERVER or SQL_DATABASE not found in .env file');
    console.error('Please check your .env file contains:');
    console.error('  SQL_SERVER=your-server.database.windows.net');
    console.error('  SQL_DATABASE=your-database-name');
    process.exit(1);
  }
  
  console.log(`Target Server: ${config.server}`);
  console.log(`Target Database: ${config.database}`);
  console.log('');
  
  try {
    // Connect to database
    console.log('Connecting to database...');
    const pool = await sql.connect(config);
    console.log('✅ Connected to database');
    console.log('');
    
    // Step 1: Deploy TRANSFERS normalization
    console.log('Step 1: Normalizing TRANSFERS table...');
    console.log('This will:');
    console.log('  - Create backup: transfers_backup_20251228');
    console.log('  - Create normalized transfers table (no redundant blood data)');
    console.log('  - Create transfers_view for backward compatibility');
    console.log('');
    
    const answer1 = await question('Deploy TRANSFERS normalization? (yes/no): ');
    if (answer1.toLowerCase() === 'yes') {
      const success1 = await executeSqlFile(
        pool,
        'migrations/normalize_transfers_to_3nf.sql',
        'logs/transfers_migration.log'
      );
      
      if (success1) {
        console.log('✅ TRANSFERS table normalized');
      } else {
        console.error('❌ Failed to normalize TRANSFERS table');
        rl.close();
        await pool.close();
        process.exit(1);
      }
    } else {
      console.log('⏭️  Skipped TRANSFERS normalization');
    }
    
    console.log('');
    
    // Step 2: Deploy POSTAL_CODES normalization
    console.log('Step 2: Creating postal_codes table...');
    console.log('This will:');
    console.log('  - Create postal_codes table');
    console.log('  - Extract postal codes from hospitals and donors');
    console.log('  - Create backups: hospitals_backup_20251228, donors_backup_20251228');
    console.log('  - Create normalized tables without city/state columns');
    console.log('  - Create views for backward compatibility');
    console.log('');
    
    const answer2 = await question('Deploy POSTAL_CODES normalization? (yes/no): ');
    if (answer2.toLowerCase() === 'yes') {
      const success2 = await executeSqlFile(
        pool,
        'migrations/create_postal_codes_table.sql',
        'logs/postal_codes_migration.log'
      );
      
      if (success2) {
        console.log('✅ POSTAL_CODES table created');
      } else {
        console.error('❌ Failed to create POSTAL_CODES table');
        rl.close();
        await pool.close();
        process.exit(1);
      }
    } else {
      console.log('⏭️  Skipped POSTAL_CODES normalization');
    }
    
    console.log('');
    console.log('========================================');
    console.log('Deployment Summary');
    console.log('========================================');
    console.log('');
    console.log('✅ Migrations created (NOT YET ACTIVE)');
    console.log('');
    console.log('Tables created:');
    console.log('  - transfers_normalized (3NF compliant)');
    console.log('  - hospitals_normalized (3NF compliant)');
    console.log('  - donors_normalized (3NF compliant)');
    console.log('  - postal_codes (lookup table)');
    console.log('');
    console.log('Views created (backward compatibility):');
    console.log('  - transfers_view');
    console.log('  - hospitals_view');
    console.log('  - donors_view');
    console.log('');
    console.log('Next Steps:');
    console.log('1. Test the normalized tables and views');
    console.log('2. Update application code to use new structure');
    console.log('3. Run node test-3nf-migration.js to verify everything works');
    console.log('4. Uncomment Step 5/6 in migration files to activate changes');
    console.log('5. Restart your application');
    console.log('');
    console.log('⚠️  WARNING: Old tables are still active until you uncomment deployment steps!');
    console.log('');
    
    rl.close();
    await pool.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    rl.close();
    process.exit(1);
  }
}

main();
