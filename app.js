const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt'); // Optional if you use hashed passwords later

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Setup session to track login
app.use(session({
    secret: 'gluSecretKey', // Secret key to sign the session ID cookie
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true only if using HTTPS
}));

// Connect to AWS RDS MySQL database
const db = mysql.createConnection({
    host: 'info2413.c9kykmw0qlxz.us-east-2.rds.amazonaws.com',
    user: 'admin',
    password: 'Info2413',
    database: 'course_registration',
    port: 3306
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
app.post('/api/login/student', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

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

        // Uncomment below if using hashed passwords:
        // const match = await bcrypt.compare(password, user.password);
        // if (!match) {
        //     return res.status(401).json({ message: "Invalid password." });
        // }

        if (password !== user.password) {
            return res.status(401).json({ message: "Invalid password." });
        }

        // ✅ Save user info in session
        req.session.userId = user.student_id;
        req.session.role = 'student';
        req.session.firstName = user.first_name;  // <-- this line fixes it

        res.json({ message: "Login successful", studentId: user.student_id, firstName: user.first_name });
    });
});

// ---------------- Admin Login Endpoint ---------------- //
app.post('/api/login/admin', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

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

        // Uncomment below if using hashed passwords:
        // const match = await bcrypt.compare(password, admin.password);
        // if (!match) {
        //     return res.status(401).json({ message: "Invalid password." });
        // }

        if (password !== admin.password) {
            return res.status(401).json({ message: "Invalid password." });
        }

        // Save admin info in session
        req.session.userId = admin.admin_id;
        req.session.role = 'admin';
        res.json({ message: "Login successful" });
    });
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
                            return res.status(400).json({ message: "This section is full. Cannot enroll.", status: "error" });
                        }

                        // ✅ Insert enrollment (all checks passed)
                        const insertSql = "INSERT INTO Course_Enrollment (Student_ID, Course_ID, Section_ID, enrolled_on) VALUES (?, ?, ?, CURDATE())";
                        db.query(insertSql, [studentId, courseId, sectionId], (insertErr) => {
                            if (insertErr) {
                                console.error("Database error during insert:", insertErr);
                                return res.status(500).json({ message: "Internal server error", status: "error" });
                            }

                            res.json({ message: "Course added successfully!", status: "success" });
                        });
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





//Reports Section: 

app.get('/api/admin/report-student-roster', (req, res) => {
    let sql = "SELECT student_id, first_name, last_name, email, program, semester FROM Student WHERE 1=1";
    const params = [];

    if (req.query.program) {
        sql += " AND program = ?";
        params.push(req.query.program);
    }

    if (req.query.semester) {
        sql += " AND semester = ?";
        params.push(req.query.semester);
    }

    if (req.query.search) {
        sql += " AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)";
        params.push(`%${req.query.search}%`, `%${req.query.search}%`, `%${req.query.search}%`);
    }

    sql += " ORDER BY student_id";

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Internal server error." });
        }
        res.json({ students: results });
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
