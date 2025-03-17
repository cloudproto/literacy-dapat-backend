const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "literacy_dapat",
  password: "DanTDMrocks123",
  port: 5432,
});

async function createTable() {
  try {
    await pool.query("DROP TABLE IF EXISTS assessments");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS assessments (
        id SERIAL PRIMARY KEY,
        student_age INTEGER NOT NULL,
        student_gender VARCHAR(10) NOT NULL,
        student_grade_level VARCHAR(50) NOT NULL,
        student_city VARCHAR(100) NOT NULL,
        student_school VARCHAR(100) NOT NULL,
        student_barangay VARCHAR(100) NOT NULL,
        student_region VARCHAR(100) NOT NULL,
        level VARCHAR(50) DEFAULT 'Nothing',
        status VARCHAR(50) DEFAULT 'Not Started',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        volunteer_id INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    console.log("Assessments table created successfully.");
  } catch (err) {
    console.error("Error creating table:", err);
  } finally {
    pool.end();
  }
}

createTable();
