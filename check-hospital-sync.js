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
    const pool = new sql.ConnectionPool(config);
    await pool.connect();
    
    // Get all hospitals from Cosmos DB via the authentication data
    console.log('📋 Checking hospitals in SQL...');
    const hospitalsResult = await pool.request().query('SELECT * FROM hospitals');
    
    console.log('Hospitals in SQL:', hospitalsResult.recordset);
    
    // Check if there are any hospitals in Cosmos DB that are missing in SQL
    console.log('\n💡 To sync a new hospital manually, run:');
    console.log(`
    const request = pool.request();
    request.input("hospital_id", sql.VarChar(10), "YOUR_HOSPITAL_ID");
    request.input("name", sql.NVarChar(255), "Hospital Name");
    request.input("phone", sql.VarChar(20), "Phone");
    request.input("address", sql.NVarChar(500), "Address");
    request.input("postal_code", sql.VarChar(10), null);
    request.input("email", sql.NVarChar(255), "Email");
    
    await request.query(\`
      INSERT INTO hospitals (hospital_id, name, address, postal_code, phone, email)
      VALUES (@hospital_id, @name, @address, @postal_code, @phone, @email)
    \`);
    `);
    
    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
