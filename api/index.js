require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "literacy_dapat",
    password: "DanTDMrocks123",
    port: 5432,
});

const app = express();
app.use(cors({
    origin: "https://literacy-dapat.vercel.app",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "https://literacy-dapat.vercel.app");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");
    
    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }
    next();
});



// Serve uploaded images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const authenticateToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    jwt.verify(token, "your_secret_key", (err, user) => {
        if (err) return res.status(403).json({ message: "Invalid token" });
        req.user = user;
        next();
    });
};

// Multer storage setup for avatars
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Avatar Upload Route
app.post("/api/upload-avatar", authenticateToken, upload.single("avatar"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;

    try {
        await pool.query(
            "UPDATE users SET avatar_url = $1 WHERE id = $2",
            [fileUrl, req.user.userId]
        );

        res.json({ avatar_url: fileUrl });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// User Registration
app.post("/api/auth/register", async (req, res) => {
    const { email, password, role, fullName = "", bio = "", avatarUrl = "", phoneNumber = "", skills = "", location = "" } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ message: "Email already registered" });
        }

        await pool.query(
            `INSERT INTO users (email, password, role, full_name, bio, avatar_url, phone_number, skills, location) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [email, hashedPassword, role || "user", fullName, bio, avatarUrl, phoneNumber, skills, location]
        );

        res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// User Login
app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query(
            "SELECT id, email, password, role, full_name, bio, avatar_url, phone_number, skills, location FROM users WHERE email = $1", 
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

        const token = jwt.sign(
            { userId: user.id, role: user.role },
            "your_secret_key",
            { expiresIn: "1h" }
        );

        res.json({ 
            token, 
            role: user.role, 
            email: user.email,
            fullName: user.full_name,
            bio: user.bio,
            avatarUrl: user.avatar_url,
            phoneNumber: user.phone_number,
            skills: user.skills,
            location: user.location
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get User Profile
app.get("/api/user/profile", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT email, full_name, bio, avatar_url, phone_number, skills, location FROM users WHERE id = $1", 
            [req.user.userId]
        );

        if (result.rows.length === 0) return res.status(404).json({ message: "Profile not found" });

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update Profile
app.put("/api/user/profile", authenticateToken, upload.single("avatar"), async (req, res) => {
    const { full_name, bio, phone_number, skills, location } = req.body;
    let avatarUrl = null;

    // If there's an avatar file uploaded, create its URL
    if (req.file) {
        avatarUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
    } else {
        // If no new avatar is uploaded, keep the existing avatar_url
        avatarUrl = req.body.avatar_url || null;
    }

    try {
        await pool.query(
            `UPDATE users 
             SET full_name = $1, bio = $2, avatar_url = $3, phone_number = $4, skills = $5, location = $6 
             WHERE id = $7`,
            [full_name, bio, avatarUrl, phone_number, skills, location, req.user.userId]
        );

        res.json({ message: "Profile updated successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Assessments API Routes

// Get assessments: volunteers see only their own, admins see all
app.get("/api/assessments", authenticateToken, async (req, res) => {
    try {
        let query = "SELECT * FROM assessments";
        let values = [];

        if (req.user.role !== "admin" && req.user.role !== "mngt") {
            query += " WHERE volunteer_id = $1";
            values.push(req.user.userId);
        }        

        query += " ORDER BY created_at DESC";

        const result = await pool.query(query, values);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/assessments", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `INSERT INTO assessments 
             (student_age, student_gender, student_grade_level, student_city, student_school, student_barangay, student_region, volunteer_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [
                req.body.student_age, req.body.student_gender, req.body.student_grade_level,
                req.body.student_city, req.body.student_school, req.body.student_barangay,
                req.body.student_region, req.user.userId
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Delete an assessment by ID
app.post("/api/assessments/delete", async (req, res) => {
    const { ids } = req.body;
    if (!ids || ids.length === 0) {
        return res.status(400).json({ message: "No assessments selected for deletion" });
    }

    try {
        await pool.query("DELETE FROM assessments WHERE id = ANY($1)", [ids]);
        res.status(200).json({ message: "Assessments deleted successfully" });
    } catch (error) {
        console.error("Error deleting assessments:", error);
        res.status(500).json({ message: "Error deleting assessments" });
    }
});

// Get a specific assessment 
//  ID
app.get("/api/assessments/:id", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT a.*, u.full_name AS volunteer_name 
             FROM assessments a
             LEFT JOIN users u ON a.volunteer_id = u.id
             WHERE a.id = $1`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Assessment not found" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



app.put("/api/assessments/:id/status", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({ error: "Missing status field" });
    }

    try {
        const result = await pool.query(
            "UPDATE assessments SET status = $1 WHERE id = $2 RETURNING *",
            [status, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Assessment not found" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error updating assessment status:", error);
        res.status(500).json({ error: "Internal Server Error" });  
    }
});

app.put("/api/assessments/:id/level", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { level } = req.body;

    if (!level) {
        return res.status(400).json({ error: "Missing level field" });
    }

    try {
        const result = await pool.query(
            "UPDATE assessments SET level = $1 WHERE id = $2 RETURNING *",
            [level, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Assessment not found" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error updating assessment level:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/api/statistics", authenticateToken, async (req, res) => {
    try {
        const { region, city, barangay, school, age, gender } = req.query;

        let query = "SELECT * FROM assessments WHERE 1=1";
        let values = [];

        if (region) {
            query += ` AND student_region = $${values.length + 1}`;
            values.push(region);
        }
        if (city) {
            query += ` AND student_city = $${values.length + 1}`;
            values.push(city);
        }
        if (barangay) {
            query += ` AND student_barangay = $${values.length + 1}`;
            values.push(barangay);
        }
        if (school) {
            query += ` AND student_school = $${values.length + 1}`;
            values.push(school);
        }
        if (age) {
            if (age.includes("-")) {
                // Handle range: age=12-20 → WHERE student_age BETWEEN 12 AND 20
                const [minAge, maxAge] = age.split("-").map(Number);
                query += ` AND student_age BETWEEN $${values.length + 1} AND $${values.length + 2}`;
                values.push(minAge, maxAge);
            } else if (age.includes(",")) {
                // Handle multiple values: age=12,15,18 → WHERE student_age IN (12, 15, 18)
                const ageValues = age.split(",").map(num => parseInt(num.trim(), 10)).filter(num => !isNaN(num));
                if (ageValues.length > 0) {
                    const placeholders = ageValues.map((_, i) => `$${values.length + i + 1}`).join(",");
                    query += ` AND student_age IN (${placeholders})`;
                    values.push(...ageValues);
                }
            } else {
                // Handle single age: age=22 → WHERE student_age = 22
                const singleAge = parseInt(age, 10);
                if (!isNaN(singleAge)) {
                    query += ` AND student_age = $${values.length + 1}`;
                    values.push(singleAge);
                }
            }
        }
        if (gender) {
            query += ` AND student_gender = $${values.length + 1}`;
            values.push(gender);
        }

        const result = await pool.query(query, values);
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching statistics:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/levels", authenticateToken, async (req, res) => {
    try {
        let query = `
            SELECT level, COUNT(*) as count FROM assessments
        `;

        const values = [];
        const conditions = [];

        if (req.query.age) {
            const ageRange = req.query.age.split(",").map(num => parseInt(num.trim(), 10));
            if (ageRange.length === 1) {
                conditions.push(`age = $${values.length + 1}`);
                values.push(ageRange[0]);
            } else if (ageRange.length === 2) {
                conditions.push(`age BETWEEN $${values.length + 1} AND $${values.length + 2}`);
                values.push(ageRange[0], ageRange[1]);
            }
        }

        if (conditions.length) {
            query += ` WHERE ` + conditions.join(" AND ");
        }

        query += ` GROUP BY level`;

        const result = await pool.query(query, values);
        const levels = ["Nothing", "Letter", "Word", "Paragraph", "Comprehension"];
        const counts = Object.fromEntries(levels.map(level => [level, 0]));

        result.rows.forEach(row => {
            counts[row.level] = parseInt(row.count);
        });

        res.json(counts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/auth/register", async (req, res) => {
    const { email, password, fullName = "", bio = "", avatarUrl = "", phoneNumber = "", skills = "", location = "" } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ message: "Email already registered" });
        }

        await pool.query(
            `INSERT INTO users (email, password, role, full_name, bio, avatar_url, phone_number, skills, location) 
            VALUES ($1, $2, 'user', $3, $4, $5, $6, $7, $8)`,
            [email, hashedPassword, fullName, bio, avatarUrl, phoneNumber, skills, location]
        );

        res.status(201).json({ message: "User registered successfully", role: "user" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Fetch all users (admin only)
app.get("/api/users", authenticateToken, async (req, res) => {
    if (req.user.role !== "mngt") {
        return res.status(403).json({ message: "Forbidden: Management access required" });
    }

    try {
        const result = await pool.query("SELECT id, email, full_name, role, avatar_url FROM users");
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Change password route
app.post("/api/user/profile/change-password", authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Both current and new password are required" });
    }

    try {
        // Check if the user exists
        const result = await pool.query("SELECT password FROM users WHERE id = $1", [req.user.userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        const user = result.rows[0];

        // Compare the current password with the stored password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Current password is incorrect" });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update the password in the database
        await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashedPassword, req.user.userId]);

        res.json({ message: "Password updated successfully" });
    } catch (error) {
        console.error("Error changing password:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});


app.get("/", (
    request, response
)=>(response.send("CloudyProot")))

app.listen(5000, () => console.log("Server running on port 5000"));

module.exports = app;

