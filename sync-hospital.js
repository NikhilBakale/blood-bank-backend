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
    
    // Check if hospital already exists
    const checkResult = await pool.request().query(`
      SELECT * FROM hospitals WHERE hospital_id = '0001'
    `);
    
    console.log('Existing hospitals:', checkResult.recordset);
    
    if (checkResult.recordset.length === 0) {
      // Insert the existing hospital from Cosmos DB
      const request = pool.request();
      
      request.input("hospital_id", sql.VarChar(10), "0001");
      request.input("name", sql.NVarChar(255), "RV");
      request.input("phone", sql.VarChar(20), "7204214843");
      request.input("address", sql.NVarChar(500), "RV");
      request.input("postal_code", sql.VarChar(10), null);
      request.input("email", sql.NVarChar(255), "nikhilp.cs23@rvce.edu.in");
      
      const result = await request.query(`
        INSERT INTO hospitals (hospital_id, name, address, postal_code, phone, email)
        VALUES (@hospital_id, @name, @address, @postal_code, @phone, @email)
      `);
      
      console.log('✅ Hospital inserted into SQL');
    } else {
      console.log('✅ Hospital already exists in SQL');
    }
    
    // Verify all hospitals
    const verifyResult = await pool.request().query('SELECT * FROM hospitals');
    console.log('All hospitals in SQL:', verifyResult.recordset);
    
    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
