require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt'); // Optional if you use hashed passwords later
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'Public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});



// Setup session to track login
app.use(session({
    secret: 'gluSecretKey', // Secret key to sign the session ID cookie
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true only if using HTTPS
}));

// Connect to AWS RDS MySQL database
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
});

// Search students by first name
app.get('/api/search', (req, res) => {
    const name = req.query.name;
    if (!name) {
        return res.status(400).json({ message: 'Name is required.' });
    }

    const sql = "SELECT * FROM Student WHERE first_name = ?";
    db.query(sql, [name], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Internal server error" });
        }

        if (results.length > 0) {
            res.json({ exists: true, data: results });
        } else {
            res.json({ exists: false });
        }
    });
});

// ---------------- Student Login Endpoint ---------------- //
// ---------------- Student Login Endpoint ---------------- //
app.post('/api/login/student', async (req, res) => {
    const { email, password, 'g-recaptcha-response': captcha } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    if (!captcha) {
        return res.status(400).json({ message: 'Please complete the reCAPTCHA.' });
    }

    const secretKey = "6LeYBZErAAAAAAdFD0uyxyJMMKuITv9PnQ-m0IHl"; // 

    try {
        // Verify CAPTCHA with Google
        const verifyURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${captcha}`;
        const response = await axios.post(verifyURL);
        const data = response.data;

        if (!data.success) {
            return res.status(403).json({ message: 'Failed reCAPTCHA verification.' });
        }

        // Continue with login
        const sql = "SELECT * FROM Student WHERE email = ?";
        db.query(sql, [email], async (err, results) => {
            if (err) {
                console.error("Database error:", err);
                return res.status(500).json({ error: "Internal server error" });
            }

            if (results.length === 0) {
                return res.status(401).json({ message: "Email not found." });
            }

            const user = results[0];

            // TODO: Use bcrypt for hashed passwords in production
            if (password !== user.password) {
                return res.status(401).json({ message: "Invalid password." });
            }

            // ✅ Save user session
            req.session.userId = user.student_id;
            req.session.role = 'student';
            req.session.firstName = user.first_name;

            res.json({
                message: "Login successful",
                studentId: user.student_id,
                firstName: user.first_name
            });
        });

    } catch (error) {
        console.error("reCAPTCHA error:", error);
        return res.status(500).json({ message: 'reCAPTCHA verification failed.' });
    }
});

// ---------------- Admin Login Endpoint ---------------- //
app.post('/api/login/admin', async (req, res) => {
    const { email, password, 'g-recaptcha-response': captcha } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    if (!captcha) {
        return res.status(400).json({ message: 'Please complete the reCAPTCHA.' });
    }

    const secretKey = "6LeYBZErAAAAAAdFD0uyxyJMMKuITv9PnQ-m0IHl"; 
    try {
        const verifyURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${captcha}`;
        const response = await axios.post(verifyURL);
        const data = response.data;

        if (!data.success) {
            return res.status(403).json({ message: 'Failed reCAPTCHA verification.' });
        }

        // Continue with login
        const sql = "SELECT * FROM Admin WHERE email = ?";
        db.query(sql, [email], async (err, results) => {
            if (err) {
                console.error("Database error:", err);
                return res.status(500).json({ error: "Internal server error" });
            }

            if (results.length === 0) {
                return res.status(401).json({ message: "Email not found." });
            }

            const admin = results[0];

            if (password !== admin.password) {
                return res.status(401).json({ message: "Invalid password." });
            }

            req.session.userId = admin.admin_id;
            req.session.role = 'admin';

            res.json({ message: "Login successful" });
        });

    } catch (error) {
        console.error("reCAPTCHA error:", error);
        return res.status(500).json({ message: 'reCAPTCHA verification failed.' });
    }
});

// ---------------- View Course Enrollment Endpoint ---------------- //

app.get('/api/student/courses', (req, res) => {
    const studentId = req.session.userId;

    if (!studentId || req.session.role !== 'student') {
        return res.status(401).json({ message: "Unauthorized. Please log in as student." });
    }

    const sql = `


        SELECT 
        c.Course_ID, 
        c.name AS Course_Name,
        s.Section_ID, 
        s.section_number, 
        s.day_of_week, 
        s.start_time, 
        s.end_time, 
        s.room_no, 
        s.mode
        FROM Course_Enrollment e
        JOIN Section s ON e.Section_ID = s.Section_ID
        JOIN Course c ON e.Course_ID = c.Course_ID
        WHERE e.Student_ID = ?;
    `;

    db.query(sql, [studentId], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Internal server error" });
        }

        res.json({ enrolledCourses: results });
    });
});



// add Courses --All Course section

app.get('/api/student/all-courses', (req, res) => {
    const sql = "SELECT * FROM Course";

    db.query(sql, async (err, courseResults) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Internal server error" });
        }

        // For each course, also get its sections
        const coursesWithSections = await Promise.all(courseResults.map(course => {
            return new Promise((resolve, reject) => {
                const sectionSql = "SELECT * FROM Section WHERE Course_ID = ?";
                db.query(sectionSql, [course.Course_ID], (err2, sections) => {
                    if (err2) {
                        reject(err2);
                    } else {
                        course.sections = sections;
                        resolve(course);
                    }
                });
            });
        }));

        res.json({ courses: coursesWithSections });
    });
});





//Drop Courses

app.post('/api/student/drop-course', (req, res) => {
    const studentId = req.session.userId;
    const { courseId, sectionId } = req.body;

    if (!studentId || req.session.role !== 'student') {
        return res.status(401).json({ message: "Unauthorized. Please log in as student.", status: "error" });
    }

    if (!courseId || !sectionId) {
        return res.status(400).json({ message: "Course ID and Section ID are required.", status: "error" });
    }

    const sql = "DELETE FROM Course_Enrollment WHERE Student_ID = ? AND Course_ID = ? AND Section_ID = ?";

    db.query(sql, [studentId, courseId, sectionId], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal server error", status: "error" });
        }

        res.json({ message: "Course dropped successfully!", status: "success" });
    });
});




// To Search Courses by  ID or Name
app.get('/api/student/search-course', (req, res) => {
    const { courseId, name, department } = req.query;

    let sql = "SELECT * FROM Course WHERE 1=1";
    const params = [];

    if (courseId) {
        sql += " AND Course_ID = ?";
        params.push(courseId);
    }

    if (name) {
        sql += " AND name LIKE ?";
        params.push(`%${name}%`);
    }

    if (department) {
        sql += " AND department LIKE ?";
        params.push(`%${department}%`);
    }

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Internal server error" });
        }
        res.json({ courses: results });
    });
});



// To get Sections of a Course 

app.get('/api/student/course-sections/:courseId', (req, res) => {
    const courseId = req.params.courseId;

    const sql = "SELECT * FROM Section WHERE Course_ID = ?";
    db.query(sql, [courseId], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Internal server error" });
        }
        res.json({ sections: results });
    });
});


// To add Courses Enrollment 
app.post('/api/student/add-course', (req, res) => {
    const studentId = req.session.userId;
    const { courseId, sectionId } = req.body;

    if (!studentId || req.session.role !== 'student') {
        return res.status(401).json({ message: "Unauthorized. Please log in as student.", status: "error" });
    }

    if (!courseId || !sectionId) {
        return res.status(400).json({ message: "Course ID and Section ID are required.", status: "error" });
    }

    const prereqSql = "SELECT prerequisite FROM Course WHERE Course_ID = ?";
    db.query(prereqSql, [courseId], (err, prereqResults) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal server error", status: "error" });
        }

        const prereqName = prereqResults[0].prerequisite;

        if (!prereqName || prereqName === "NULL" || prereqName === "") {
            checkDuplicateAndConflict();
            return;
        }

        const completedSql = `
            SELECT c.name
            FROM Completed_Courses cc
            JOIN Course c ON cc.Course_ID = c.Course_ID
            WHERE cc.Student_ID = ? AND c.name = ?
        `;

        db.query(completedSql, [studentId, prereqName], (err2, completedResults) => {
            if (err2) {
                console.error("Database error:", err2);
                return res.status(500).json({ message: "Internal server error", status: "error" });
            }

            if (completedResults.length === 0) {
                return res.status(400).json({ message: `Prerequisite not met: ${prereqName}`, status: "error" });
            }

            checkDuplicateAndConflict();
        });
    });

    function checkDuplicateAndConflict() {
        const checkSql = "SELECT * FROM Course_Enrollment WHERE Student_ID = ? AND Course_ID = ?";
        db.query(checkSql, [studentId, courseId], (checkErr, checkResults) => {
            if (checkErr) {
                console.error("Database error during duplicate check:", checkErr);
                return res.status(500).json({ message: "Internal server error", status: "error" });
            }

            if (checkResults.length > 0) {
                return res.status(400).json({ message: "You are already enrolled in this course (any section).", status: "error" });
            }

            const newSectionSql = "SELECT day_of_week, start_time, end_time FROM Section WHERE Section_ID = ?";
            db.query(newSectionSql, [sectionId], (secErr, newSecResults) => {
                if (secErr || newSecResults.length === 0) {
                    console.error("Database error while checking section:", secErr);
                    return res.status(500).json({ message: "Error fetching section details.", status: "error" });
                }

                const newSection = newSecResults[0];

                const enrolledSql = `
                    SELECT s.day_of_week, s.start_time, s.end_time
                    FROM Course_Enrollment ce
                    JOIN Section s ON ce.Section_ID = s.Section_ID
                    WHERE ce.Student_ID = ?
                `;

                db.query(enrolledSql, [studentId], (enrErr, enrolledSections) => {
                    if (enrErr) {
                        console.error("Database error while checking conflicts:", enrErr);
                        return res.status(500).json({ message: "Error checking schedule conflicts.", status: "error" });
                    }

                    const conflict = enrolledSections.some(sec =>
                        sec.day_of_week === newSection.day_of_week &&
                        (newSection.start_time < sec.end_time && newSection.end_time > sec.start_time)
                    );

                    if (conflict) {
                        return res.status(400).json({ message: "Schedule conflict: You are already enrolled in another course at this time.", status: "error" });
                    }

                    // ✅ Capacity check
                    const sectionCapacitySql = `
                        SELECT capacity, COUNT(ce.Student_ID) AS enrolledCount
                        FROM Section s
                        LEFT JOIN Course_Enrollment ce ON s.Section_ID = ce.Section_ID
                        WHERE s.Section_ID = ?
                        GROUP BY s.Section_ID
                    `;
                    db.query(sectionCapacitySql, [sectionId], (capErr, capResults) => {
                        if (capErr || capResults.length === 0) {
                            console.error("Error checking capacity:", capErr);
                            return res.status(500).json({ message: "Error checking section capacity.", status: "error" });
                        }

                        const { capacity, enrolledCount } = capResults[0];
                        if (enrolledCount >= capacity) {
                            // ✅ Check waitlist count
                            const waitlistCountSql = `
                                SELECT COUNT(*) AS waitlistCount 
                                FROM Waitlist 
                                WHERE Section_ID = ?
                            `;
                            db.query(waitlistCountSql, [sectionId], (waitErr, waitResults) => {
                                if (waitErr) {
                                    console.error("Error checking waitlist count:", waitErr);
                                    return res.status(500).json({ message: "Error checking waitlist.", status: "error" });
                                }

                                const waitlistCount = waitResults[0].waitlistCount;
                                if (waitlistCount >= 10) {
                                    return res.status(400).json({ message: "Error: Class Size and Waitlist is full for this Section.", status: "error" });
                                }

                                // ✅ Add to waitlist
                                const semester = "Fall 2025"; // Or dynamically fetch if available
                                const insertWaitlist = `
                                    INSERT INTO Waitlist (Student_ID, Course_ID, Section_ID, Semester)
                                    VALUES (?, ?, ?, ?)
                                `;
                                db.query(insertWaitlist, [studentId, courseId, sectionId, semester], (waitInsErr) => {
                                    if (waitInsErr) {
                                        console.error("Error inserting into waitlist:", waitInsErr);
                                        return res.status(500).json({ message: "Could not add to waitlist. Possible reason: You are already on the list ", status: "error" });
                                    }

                                    return res.status(200).json({ message: "Section is full. You have been added to the waitlist.", status: "waitlisted" });
                                });
                            });
                        } else {
                            // ✅ Insert enrollment (all checks passed)
                            const insertSql = "INSERT INTO Course_Enrollment (Student_ID, Course_ID, Section_ID, enrolled_on) VALUES (?, ?, ?, CURDATE())";
                            db.query(insertSql, [studentId, courseId, sectionId], (insertErr) => {
                                if (insertErr) {
                                    console.error("Database error during insert:", insertErr);
                                    return res.status(500).json({ message: "Internal server error", status: "error" });
                                }

                                res.json({ message: "Course added successfully!", status: "success" });
                            });
                        }
                    });
                });
            });
        });
    }
});






//Create exchange request

app.post('/api/exchange-request', (req, res) => {
    const fromStudentId = req.session.userId;
    const { courseId, sectionFrom, sectionTo } = req.body;

    if (!fromStudentId || req.session.role !== 'student') {
        return res.status(401).json({ message: "Unauthorized. Please log in as student." });
    }

    const sql = `INSERT INTO Exchange_Request 
                 (Course_ID, Section_From, Section_To, RequestFromStudentID) 
                 VALUES (?, ?, ?, ?)`;

    db.query(sql, [courseId, sectionFrom, sectionTo, fromStudentId], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Internal server error" });
        }
        res.json({ message: "Exchange request created successfully!" });
    });
});



//View Pending Exchange Requests

app.get('/api/exchange-requests', (req, res) => {
    const studentId = req.session.userId;

    if (!studentId || req.session.role !== 'student') {
        return res.status(401).json({ message: "Unauthorized. Please log in as student." });
    }

    // Get student's enrolled sections
    const sqlSections = "SELECT Course_ID, Section_ID FROM Course_Enrollment WHERE Student_ID = ?";

    db.query(sqlSections, [studentId], (err, enrolledSections) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Internal server error" });
        }

        if (enrolledSections.length === 0) {
            return res.json({ requests: [] });
        }

        const conditions = enrolledSections.map(s => `(er.Course_ID = ${s.Course_ID} AND er.Section_To = ${s.Section_ID})`).join(" OR ");

        const sqlRequests = `
            SELECT 
                er.Request_ID,
                c.Course_ID,
                c.name AS Course_Name,
                sf.section_number AS From_Section,
                st.section_number AS To_Section,
                er.RequestFromStudentID,
                er.Status,
                er.Requested_On
            FROM Exchange_Request er
            JOIN Course c ON er.Course_ID = c.Course_ID
            JOIN Section sf ON er.Section_From = sf.Section_ID
            JOIN Section st ON er.Section_To = st.Section_ID
            WHERE er.Status = 'Pending' AND (${conditions})
            ORDER BY er.Requested_On DESC
        `;

        db.query(sqlRequests, (err2, results) => {
            if (err2) {
                console.error("Database error:", err2);
                return res.status(500).json({ error: "Internal server error" });
            }
            res.json({ requests: results });
        });
    });
});





//Approve Exchange Request and Swap

app.post('/api/exchange-request/approve', (req, res) => {
    const studentId = req.session.userId;
    const { requestId } = req.body;

    if (!studentId || req.session.role !== 'student') {
        return res.status(401).json({ message: "Unauthorized. Please log in as student." });
    }

    const sqlSelect = `SELECT * FROM Exchange_Request WHERE Request_ID = ? AND Status = 'Pending'`;

    db.query(sqlSelect, [requestId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ message: "Request not found or already processed." });
        }

        const request = results[0];

        // Update enrollments (swap sections)
        const sqlUpdate1 = `UPDATE Course_Enrollment 
                            SET Section_ID = ? 
                            WHERE Student_ID = ? AND Course_ID = ?`;

        const sqlUpdate2 = `UPDATE Course_Enrollment 
                            SET Section_ID = ? 
                            WHERE Student_ID = ? AND Course_ID = ?`;

        db.query(sqlUpdate1, [request.Section_To, request.RequestFromStudentID, request.Course_ID], (err1) => {
            if (err1) {
                console.error(err1);
                return res.status(500).json({ error: "Error updating first student enrollment." });
            }

            db.query(sqlUpdate2, [request.Section_From, studentId, request.Course_ID], (err2) => {
                if (err2) {
                    console.error(err2);
                    return res.status(500).json({ error: "Error updating second student enrollment." });
                }

                const sqlMark = `UPDATE Exchange_Request SET Status = 'Approved' WHERE Request_ID = ?`;
                db.query(sqlMark, [requestId], (err3) => {
                    if (err3) {
                        console.error(err3);
                        return res.status(500).json({ error: "Error updating request status." });
                    }

                    res.json({ message: "Sections exchanged successfully!" });
                });
            });
        });
    });
});



// View My Current Exchange Requests




// To Fetch Studnent Profile Information

app.get('/api/session-info', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: "Not logged in." });
    }
    res.json({
        userId: req.session.userId,
        firstName: req.session.firstName,
        role: req.session.role
    });
});


// View My Current Exchange requests

app.get('/api/my-exchange-requests', (req, res) => {
    const studentId = req.session.userId;

    if (!studentId || req.session.role !== 'student') {
        return res.status(401).json({ message: "Unauthorized. Please log in as student." });
    }

    const sql = `
        SELECT 
            er.Request_ID,
            c.Course_ID,
            c.name AS Course_Name,
            sf.section_number AS From_Section,
            st.section_number AS To_Section,
            er.Status,
            er.Requested_On
        FROM Exchange_Request er
        JOIN Course c ON er.Course_ID = c.Course_ID
        JOIN Section sf ON er.Section_From = sf.Section_ID
        JOIN Section st ON er.Section_To = st.Section_ID
        WHERE er.RequestFromStudentID = ?
        ORDER BY er.Requested_On DESC
    `;

    db.query(sql, [studentId], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Internal server error" });
        }

        res.json({ requests: results });
    });
});




// Transcript
// View Transcript and GPA
app.get('/api/student/transcript', (req, res) => {
    const studentId = req.session.userId;

    if (!studentId || req.session.role !== 'student') {
        return res.status(401).json({ message: "Unauthorized. Please log in as student." });
    }

    const gradePoints = { 'A': 4.0, 'A-': 3.7, 'B+': 3.5, 'B': 3.0, 'B-': 2.7, 'C+': 2.5, 'C': 2.0, 'D': 1.0, 'F': 0 };

    const sql = `
        SELECT c.name, c.credits, cc.Grade, cc.semester
        FROM Completed_Courses cc
        JOIN Course c ON cc.Course_ID = c.Course_ID
        WHERE cc.Student_ID = ?
        ORDER BY cc.semester DESC
    `;

    db.query(sql, [studentId], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Internal server error" });
        }

        let totalPoints = 0;
        let totalCredits = 0;

        results.forEach(row => {
            const points = gradePoints[row.Grade] || 0;
            totalPoints += points * row.credits;
            totalCredits += row.credits;
        });

        const gpa = totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : 'N/A';

        res.json({ transcript: results, gpa });
    });
});




// Student Profile Information

app.get('/api/student/profile', (req, res) => {
    const studentId = req.session.userId;

    if (!studentId || req.session.role !== 'student') {
        return res.status(401).json({ message: "Unauthorized. Please log in as student." });
    }

    const sql = `
        SELECT student_id, first_name, last_name, email, date_of_birth, street, city, province, postal_code, program, semester
        FROM Student
        WHERE student_id = ?
    `;

    db.query(sql, [studentId], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal server error." });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: "Student not found." });
        }

        res.json({ student: results[0] });
    });
});


app.post('/api/student/update-profile', (req, res) => {
    const studentId = req.session.userId;

    if (!studentId || req.session.role !== 'student') {
        return res.status(401).json({ message: "Unauthorized. Please log in as student." });
    }

    const { street, city, province, postal_code, email } = req.body;

    const sql = `
        UPDATE Student
        SET street = ?, city = ?, province = ?, postal_code = ?, email = ?
        WHERE student_id = ?
    `;

    db.query(sql, [street, city, province, postal_code, email, studentId], (err, result) => {
        if (err) {
            console.error("Database error:", err);
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ message: "This email is already in use." });
            }
            return res.status(500).json({ message: "Internal server error." });
        }

        res.json({ message: "Profile updated successfully!" });
    });
});



// Admin Functions:::

// Admin Dashboard

// Exchange requests status (Approved vs Pending)
app.get('/api/admin/exchange-request-status', (req, res) => {
    const sql = `
        SELECT 
            SUM(CASE WHEN Status = 'Pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN Status = 'Approved' THEN 1 ELSE 0 END) AS approved
        FROM Exchange_Request
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal server error" });
        }
        res.json(results[0]);
    });
});

// Available seats and average section strength
app.get('/api/admin/section-overview', (req, res) => {
    const sql = `
        SELECT 
            SUM(s.capacity - IFNULL(e.enrolledCount, 0)) AS availableSeats,
            AVG(IFNULL(e.enrolledCount, 0) / s.capacity) AS averageStrength
        FROM Section s
        LEFT JOIN (
            SELECT Section_ID, COUNT(Student_ID) AS enrolledCount
            FROM Course_Enrollment
            GROUP BY Section_ID
        ) e ON s.Section_ID = e.Section_ID
        WHERE s.capacity > 0
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal server error" });
        }
        const data = results[0];
        data.averageStrength = data.averageStrength ? (data.averageStrength * 100).toFixed(1) : '0.0';
        res.json(data);
    });
});



//Admin Manage Section



// Create Student 

// ----------------------
// Create Student API
// ----------------------
app.post('/api/admin/create-student', async (req, res) => {
  const {
    first_name,
    last_name,
    email,
    password,
    date_of_birth,
    street,
    city,
    province,
    postal_code,
    program,
    semester
  } = req.body;

  // 1) Validate required
  if (
    !first_name || !last_name ||
    !email || !password ||
    !date_of_birth || !program ||
    !semester
  ) {
    return res.status(400).json({
      success: false,
      message: 'Please fill in all required fields.'
    });
  }

  // 2) Duplicate-email check
  db.query(
    'SELECT COUNT(*) AS cnt FROM Student WHERE email = ?',
    [email],
    async (err, rows) => {
      if (err) {
        console.error('Email check error:', err);
        return res.status(500).json({ success: false, message: 'Server error.' });
      }
      if (rows[0].cnt > 0) {
        return res.status(400).json({ success: false, message: 'Email is already registered.' });
      }

      try {
        // 3) Hash password
        const hash = await bcrypt.hash(password, 10);

        // 4) Insert student
        const sql = `
          INSERT INTO Student
            (password, first_name, last_name, date_of_birth,
             street, city, province, postal_code,
             email, program, semester)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        db.query(
          sql,
          [
            hash,
            first_name,
            last_name,
            date_of_birth,
            street   || null,
            city     || null,
            province || null,
            postal_code || null,
            email,
            program,
            semester
          ],
          (err2, result) => {
            if (err2) {
              console.error('Create Student Error:', err2);
              return res.status(500).json({ success: false, message: 'Failed to create student.' });
            }

            // 5) Fetch and return the new record (sans password)
            db.query(
              `SELECT
                 student_id,
                 first_name,
                 last_name,
                 email,
                 program,
                 semester
               FROM Student
               WHERE student_id = ?`,
              [result.insertId],
              (err3, students) => {
                if (err3) {
                  console.error('Fetch new student error:', err3);
                  return res.status(500).json({
                    success: false,
                    message: 'Student created but failed to retrieve details.'
                  });
                }
                res.json({
                  success: true,
                  student: students[0]
                });
              }
            );
          }
        );
      } catch (hashErr) {
        console.error('Hashing error:', hashErr);
        res.status(500).json({ success: false, message: 'Server error.' });
      }
    }
  );
});


// ---------------------- Update Student API ----------------------
// --- Search students ---
// --- Search students by ID, first name, last name or email ---
// --- Search students by any field (q) ---
// --- SEARCH STUDENTS (with pagination) ---
app.get('/api/admin/search-students', (req, res) => {
  const q = req.query.q?.trim();
  if (!q) return res.status(400).json({ message: 'Query (q) is required.' });

  const page     = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = 20;
  const offset   = (page - 1) * pageSize;
  const likeQ    = `%${q}%`;

  // 1) count total matching
  const countSql = `
    SELECT COUNT(*) AS total
      FROM Student
     WHERE student_id = ?
        OR first_name LIKE ?
        OR last_name  LIKE ?
        OR email      LIKE ?
  `;
  db.query(countSql, [ q, likeQ, likeQ, likeQ ], (cntErr, cntRows) => {
    if (cntErr) {
      console.error('Search count error:', cntErr);
      return res.status(500).json({ message: 'Server error.' });
    }
    const total      = cntRows[0].total;
    const totalPages = Math.ceil(total / pageSize);

    // 2) fetch this page
    const dataSql = `
      SELECT student_id, first_name, last_name, email, program, semester
        FROM Student
       WHERE student_id = ?
          OR first_name LIKE ?
          OR last_name  LIKE ?
          OR email      LIKE ?
       ORDER BY student_id
       LIMIT ? OFFSET ?
    `;
    db.query(
      dataSql,
      [ q, likeQ, likeQ, likeQ, pageSize, offset ],
      (dataErr, rows) => {
        if (dataErr) {
          console.error('Search data error:', dataErr);
          return res.status(500).json({ message: 'Server error.' });
        }
        res.json({ students: rows, page, pageSize, total, totalPages });
      }
    );
  });
});




// --- Fetch one student ---
app.get('/api/admin/student/:id', (req, res) => {
  db.query(
    'SELECT * FROM Student WHERE student_id = ?',
    [req.params.id],
    (err, rows) => {
      if (err) {
        console.error('Fetch student error:', err);
        return res.status(500).json({ message:'Server error.' });
      }
      if (!rows.length) return res.status(404).json({ message:'Not found.' });
      res.json({ student: rows[0] });
    }
  );
});

// --- Update student ---
app.post('/api/admin/update-student', (req, res) => {
  const {
    id, first_name, last_name, email, date_of_birth,
    street, city, province, postal_code,
    program, semester
  } = req.body;
  if (!id||!first_name||!last_name||!email||!date_of_birth||!program||!semester) {
    return res.status(400).json({ success:false, message:'Missing fields.' });
  }

  // duplicate email?
  db.query(
    'SELECT COUNT(*) AS cnt FROM Student WHERE email = ? AND student_id <> ?',
    [email,id],
    (e,rows) => {
      if (e) {
        console.error('Email check error:',e);
        return res.status(500).json({ success:false, message:'Server error.' });
      }
      if (rows[0].cnt>0) {
        return res.json({ success:false, message:'Email in use.' });
      }
      // do update
      const sql = `
        UPDATE Student
        SET first_name=?, last_name=?, email=?, date_of_birth=?,
            street=?, city=?, province=?, postal_code=?,
            program=?, semester=?
        WHERE student_id=?
      `;
      db.query(sql, [
        first_name, last_name, email, date_of_birth,
        street, city, province, postal_code,
        program, semester, id
      ], err2 => {
        if (err2) {
          console.error('Update student error:',err2);
          return res.status(500).json({ success:false, message:'Failed.' });
        }
        res.json({ success:true, message:'Updated.' });
      });
    }
  );
});

// --- Delete student ---
app.post('/api/admin/delete-student', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ success:false, message:'ID required.' });
  db.query(
    'DELETE FROM Student WHERE student_id = ?',
    [id],
    (err, result) => {
      if (err) {
        console.error('Delete student error:',err);
        return res.status(500).json({
          success:false,
          message:'Cannot delete; check enrollments.'
        });
      }
      if (result.affectedRows===0) {
        return res.json({ success:false, message:'Not found.' });
      }
      res.json({ success:true, message:'Deleted.' });
    }
  );
});


// Create Course Section

// 1) Fetch all courses for the prerequisite dropdown
// 1) Fetch all courses for prerequisite dropdown
// 1) Fetch all courses (id + name) for both picker & prerequisite
app.get('/api/admin/all-courses', (req, res) => {
  const sql = `SELECT Course_ID, name FROM Course ORDER BY name`;
  db.query(sql, (err, results) => {
    if (err) {
      console.error("Fetch courses error:", err);
      return res.status(500).json({ message: "Error fetching courses." });
    }
    // results is now an array of { Course_ID, name }
    res.json({ courses: results });
  });
});


// 2) Create Course with duplicate-name check
app.post('/api/admin/create-course', (req, res) => {
  const { name, description, credits, department, semester, prerequisite } = req.body;
  if (!name || !description || !credits || !department || !semester) {
    return res.status(400).json({ success: false, message: "Missing required fields." });
  }

  // Check for duplicate name
  db.query(
    "SELECT COUNT(*) AS cnt FROM Course WHERE name = ?",
    [name],
    (err, rows) => {
      if (err) {
        console.error("Duplicate check error:", err);
        return res.status(500).json({ success: false, message: "Server error." });
      }
      if (rows[0].cnt > 0) {
        return res.json({ success: false, message: "Course name already exists." });
      }

      // Insert new course
      const sql = `
        INSERT INTO Course
          (name, description, credits, department, semester, prerequisite)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      db.query(
        sql,
        [name, description, credits, department, semester, prerequisite],
        (err2, result) => {
          if (err2) {
            console.error("Create Course Error:", err2);
            return res.status(500).json({ success: false, message: "Failed to create course." });
          }
          // Return inserted ID & name
          res.json({
            success:    true,
            courseId:   result.insertId,
            courseName: name,
            message:    "Course created successfully!"
          });
        }
      );
    }
  );
});



// update course
// 1) Fetch a single course’s details
app.get('/api/admin/course/:id', (req, res) => {
  const id = req.params.id;
  db.query(
    "SELECT * FROM Course WHERE Course_ID = ?",
    [id],
    (err, results) => {
      if (err) {
        console.error("Fetch course error:", err);
        return res.status(500).json({ message: "Server error." });
      }
      if (!results.length) {
        return res.status(404).json({ message: "Course not found." });
      }
      res.json({ course: results[0] });
    }
  );
});

// 2) Update course with duplicate-name check
app.post('/api/admin/update-course', (req, res) => {
  const { id, name, description, credits, department, semester, prerequisite } = req.body;
  if (!id || !name || !description || !credits || !department || !semester) {
    return res.status(400).json({ success: false, message: "Missing required fields." });
  }

  // Check for other course with same name
  db.query(
    "SELECT COUNT(*) AS cnt FROM Course WHERE name = ? AND Course_ID <> ?",
    [name, id],
    (err, rows) => {
      if (err) {
        console.error("Duplicate check error:", err);
        return res.status(500).json({ success: false, message: "Server error." });
      }
      if (rows[0].cnt > 0) {
        return res.json({ success: false, message: "Another course already uses that name." });
      }

      // Perform update
      const sql = `
        UPDATE Course
        SET name=?, description=?, credits=?, department=?, semester=?, prerequisite=?
        WHERE Course_ID=?
      `;
      db.query(
        sql, [name, description, credits, department, semester, prerequisite, id],
        (err2) => {
          if (err2) {
            console.error("Update Course Error:", err2);
            return res.status(500).json({ success: false, message: "Failed to update course." });
          }
          res.json({ success: true, message: "Course updated successfully!" });
        }
      );
    }
  );
});


// Delete Course
app.post('/api/admin/delete-course', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ success: false, message: 'Course ID is required.' });
  }
  db.query(
    'DELETE FROM Course WHERE Course_ID = ?',
    [id],
    (err, result) => {
      if (err) {
        console.error('Delete Course Error:', err);
        return res.status(500).json({
          success: false,
          message: 'Cannot delete course; it may be in use.'
        });
      }
      if (result.affectedRows === 0) {
        return res.json({ success: false, message: 'Course not found.' });
      }
      res.json({ success: true, message: 'Course deleted successfully.' });
    }
  );
});


// Instructor section

// --- Fetch all instructors for dropdowns, tables, etc. ---
app.get('/api/admin/all-instructors', (req, res) => {
  const sql = `SELECT Instructor_ID AS id,
                      CONCAT(First_Name,' ',Last_Name) AS name,
                      Email,
                      Department
               FROM Instructor
               ORDER BY Instructor_ID`;
  db.query(sql, (err, results) => {
    if (err) {
      console.error("Fetch instructors error:", err);
      return res.status(500).json({ message: "Error fetching instructors." });
    }
    res.json({ instructors: results });
  });
});

// --- Create Instructor ---
app.post('/api/admin/create-instructor', (req, res) => {
  const { firstName, lastName, email, department } = req.body;
  if (!firstName || !lastName || !email || !department) {
    return res.status(400).json({ success: false, message: "All fields are required." });
  }
  // 1) Duplicate‐email check
  db.query("SELECT COUNT(*) AS cnt FROM Instructor WHERE Email = ?", [email], (err, rows) => {
    if (err) {
      console.error("Email check error:", err);
      return res.status(500).json({ success: false, message: "Server error." });
    }
    if (rows[0].cnt > 0) {
      return res.json({ success: false, message: "Email already in use." });
    }
    // 2) Generate next ID (I###)
    db.query("SELECT Instructor_ID FROM Instructor ORDER BY Instructor_ID DESC LIMIT 1", (err2, ids) => {
      if (err2) {
        console.error("ID fetch error:", err2);
        return res.status(500).json({ success: false, message: "Server error." });
      }
      let next = "I001";
      if (ids.length) {
        const num = parseInt(ids[0].Instructor_ID.slice(1)) + 1;
        next = "I" + String(num).padStart(3, "0");
      }
      // 3) Insert
      db.query(
        `INSERT INTO Instructor
           (Instructor_ID, First_Name, Last_Name, Email, Department)
         VALUES (?, ?, ?, ?, ?)`,
        [ next, firstName, lastName, email, department ],
        err3 => {
          if (err3) {
            console.error("Create error:", err3);
            return res.status(500).json({ success: false, message: "Failed to create." });
          }
          res.json({
            success: true,
            id:      next,
            name:    firstName + " " + lastName,
            message: "Instructor created."
          });
        }
      );
    });
  });
});

// --- Fetch one instructor for editing ---
app.get('/api/admin/instructor/:id', (req, res) => {
  db.query(
    "SELECT * FROM Instructor WHERE Instructor_ID = ?",
    [ req.params.id ],
    (err, rows) => {
      if (err) {
        console.error("Fetch error:", err);
        return res.status(500).json({ message: "Server error." });
      }
      if (!rows.length) {
        return res.status(404).json({ message: "Not found." });
      }
      res.json({ instructor: rows[0] });
    }
  );
});

// --- Update Instructor ---
app.post('/api/admin/update-instructor', (req, res) => {
  const { id, firstName, lastName, email, department } = req.body;
  if (!id || !firstName || !lastName || !email || !department) {
    return res.status(400).json({ success: false, message: "Missing fields." });
  }
  // 1) Duplicate‐email check
  db.query(
    "SELECT COUNT(*) AS cnt FROM Instructor WHERE Email = ? AND Instructor_ID <> ?",
    [ email, id ],
    (err, rows) => {
      if (err) {
        console.error("Email check error:", err);
        return res.status(500).json({ success: false, message: "Server error." });
      }
      if (rows[0].cnt > 0) {
        return res.json({ success: false, message: "Email already in use." });
      }
      // 2) Perform update
      db.query(
        `UPDATE Instructor
         SET First_Name=?, Last_Name=?, Email=?, Department=?
         WHERE Instructor_ID=?`,
        [ firstName, lastName, email, department, id ],
        err2 => {
          if (err2) {
            console.error("Update error:", err2);
            return res.status(500).json({ success: false, message: "Failed to update." });
          }
          res.json({ success: true, message: "Instructor updated." });
        }
      );
    }
  );
});

// --- Delete Instructor ---
app.post('/api/admin/delete-instructor', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ success: false, message: "ID is required." });
  }
  db.query("DELETE FROM Instructor WHERE Instructor_ID = ?", [id], (err, result) => {
    if (err) {
      console.error("Delete error:", err);
      return res.status(500).json({
        success: false,
        message: "Cannot delete; instructor may be assigned to courses."
      });
    }
    if (result.affectedRows === 0) {
      return res.json({ success: false, message: "Instructor not found." });
    }
    res.json({ success: true, message: "Instructor deleted." });
  });
});




//Reports Section: 

// --- REPORT STUDENT ROSTER (with pagination) ---
app.get('/api/admin/report-student-roster', (req, res) => {
  const program  = req.query.program;
  const semester = req.query.semester;
  const courseId = req.query.courseId;
  const search   = req.query.search;
  const page     = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = 20;
  const offset   = (page - 1) * pageSize;

  const whereClauses = [];
  const params       = [];

  if (program) {
    whereClauses.push(`program = ?`);
    params.push(program);
  }
  if (semester) {
    whereClauses.push(`semester = ?`);
    params.push(semester);
  }
  if (courseId) {
    whereClauses.push(`student_id IN (SELECT Student_ID FROM Course_Enrollment WHERE Course_ID = ?)`);
    params.push(courseId);
  }
  if (search) {
    whereClauses.push(`(first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)`);
    const likeS = `%${search}%`;
    params.push(likeS, likeS, likeS);
  }

  const whereSQL = whereClauses.length
    ? `WHERE ` + whereClauses.join(' AND ')
    : '';

  // 1) count total
  const countSql = `
    SELECT COUNT(*) AS total
      FROM Student
    ${whereSQL}
  `;
  db.query(countSql, params, (cntErr, cntRows) => {
    if (cntErr) {
      console.error('Roster count error:', cntErr);
      return res.status(500).json({ message: 'Server error.' });
    }
    const total      = cntRows[0].total;
    const totalPages = Math.ceil(total / pageSize);

    // 2) fetch page
    const dataSql = `
      SELECT student_id, first_name, last_name, email, program, semester
        FROM Student
      ${whereSQL}
      ORDER BY student_id
      LIMIT ? OFFSET ?
    `;
    db.query(
      dataSql,
      [...params, pageSize, offset],
      (dataErr, rows) => {
        if (dataErr) {
          console.error('Roster data error:', dataErr);
          return res.status(500).json({ message: 'Server error.' });
        }
        res.json({ students: rows, page, pageSize, total, totalPages });
      }
    );
  });
});


app.get('/api/admin/all-courses', (req, res) => {
    const sql = "SELECT Course_ID, name FROM Course ORDER BY name";
    db.query(sql, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal server error." });
        }
        res.json({ courses: results });
    });
});

// Course_Enrollment: View all students enrolled in a course
app.get('/api/admin/course-section-status', (req, res) => {
    let sql = `
        SELECT 
            c.Course_ID,
            c.name AS course_name,
            sec.section_number,
            sec.capacity,
            sec.Section_ID AS section_id,  -- ✅ Fixed: include section ID
            COUNT(ce.Student_ID) AS enrolled
        FROM Section sec
        JOIN Course c ON sec.Course_ID = c.Course_ID
        LEFT JOIN Course_Enrollment ce ON sec.Section_ID = ce.Section_ID
        WHERE 1=1
    `;
    const params = [];

    if (req.query.courseId) {
        sql += " AND c.Course_ID = ?";
        params.push(req.query.courseId);
    }

    sql += " GROUP BY sec.Section_ID ORDER BY c.name, sec.section_number";

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal server error." });
        }
        res.json({ sections: results });
    });
});


app.get('/api/admin/section-enrollments/:sectionId', (req, res) => {
    const sectionId = req.params.sectionId;

    const sql = `
        SELECT s.student_id, s.first_name, s.last_name, s.email, s.program, s.semester
        FROM Course_Enrollment ce
        JOIN Student s ON ce.Student_ID = s.student_id
        WHERE ce.Section_ID = ?
        ORDER BY s.last_name
    `;

    db.query(sql, [sectionId], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal server error." });
        }
        res.json({ students: results });
    });
});



// Admin: View a student's enrolled courses
app.get('/api/admin/student-courses/:studentId', (req, res) => {
    const studentId = req.params.studentId;

    const sql = `
        SELECT c.Course_ID, c.name AS course_name, sec.section_number
        FROM Course_Enrollment ce
        JOIN Course c ON ce.Course_ID = c.Course_ID
        JOIN Section sec ON ce.Section_ID = sec.Section_ID
        WHERE ce.Student_ID = ?
        ORDER BY c.Course_ID
    `;

    db.query(sql, [studentId], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal server error." });
        }
        res.json({ courses: results });
    });
});



app.get('/api/admin/report-enrollment-by-program', (req, res) => {
    const sql = `
        SELECT program, COUNT(*) AS student_count
        FROM Student
        GROUP BY program
        ORDER BY program
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal server error" });
        }
        res.json({ programs: results });
    });
});


app.get('/api/admin/report-enrollment-by-semester', (req, res) => {
    const sql = `
        SELECT semester, COUNT(*) AS student_count
        FROM Student
        GROUP BY semester
        ORDER BY semester
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal server error" });
        }
        res.json({ semesters: results });
    });
});



app.get('/api/admin/report-course-enrollment', (req, res) => {
    const sql = `
        SELECT ce.Student_ID, s.first_name, s.last_name, c.Course_ID, c.name AS course_name, sec.section_number
        FROM Course_Enrollment ce
        JOIN Student s ON ce.Student_ID = s.student_id
        JOIN Course c ON ce.Course_ID = c.Course_ID
        JOIN Section sec ON ce.Section_ID = sec.Section_ID
        ORDER BY c.Course_ID, s.last_name
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal server error" });
        }
        res.json({ enrollments: results });
    });
});



// Overall summary stats
app.get('/api/admin/summary', (req, res) => {
    const summary = {};
    db.query('SELECT COUNT(*) AS count FROM Student', (err, studentResults) => {
        if (err) return res.status(500).json({ message: "Error fetching students" });
        summary.totalStudents = studentResults[0].count;

        db.query('SELECT COUNT(*) AS count FROM Course', (err2, courseResults) => {
            if (err2) return res.status(500).json({ message: "Error fetching courses" });
            summary.totalCourses = courseResults[0].count;

            db.query('SELECT COUNT(*) AS count FROM Section', (err3, sectionResults) => {
                if (err3) return res.status(500).json({ message: "Error fetching sections" });
                summary.totalSections = sectionResults[0].count;

                db.query("SELECT COUNT(*) AS count FROM Exchange_Request WHERE Status = 'Pending'", (err4, reqResults) => {
                    if (err4) return res.status(500).json({ message: "Error fetching requests" });
                    summary.pendingRequests = reqResults[0].count;

                    res.json(summary);
                });
            });
        });
    });
});

// Section status overview
app.get('/api/admin/section-status', (req, res) => {
    const sql = `
        SELECT 
            c.name AS course_name,
            s.section_number,
            s.capacity,
            COUNT(ce.Student_ID) AS enrolled
        FROM Section s
        JOIN Course c ON s.Course_ID = c.Course_ID
        LEFT JOIN Course_Enrollment ce ON s.Section_ID = ce.Section_ID
        GROUP BY s.Section_ID
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal server error" });
        }
        res.json({ sections: results });
    });
});




// ---------------- Start the server ---------------- //
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});
