require("dotenv").config();
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "literacy_dapat",
    password: "DanTDMrocks123",
    port: 5432,
});

const seedUsers = async () => {
    const users = [
        { email: "aaronmichaelichua@gmail.com", password: "IamUser", role: "user" },
        { email: "literacyadmin@gmail.com", password: "IamAdmin", role: "admin" },
        { email: "literacymngt@gmail.com", password: "IamMngt", role: "mngt" },
    ];

    for (let user of users) {
        const hashedPassword = await bcrypt.hash(user.password, 10);
        await pool.query("INSERT INTO users (email, password, role) VALUES ($1, $2, $3)", 
            [user.email, hashedPassword, user.role]
        );
    }

    console.log("Dummy users inserted ✅");
    pool.end();
};


seedUsers().catch((err) => console.error(err));
