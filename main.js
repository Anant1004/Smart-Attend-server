const express = require('express');
const morgan = require('morgan');
const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { signup, login, logout } = require('./controllers/authControllers');
const User = require('./models/user');
const Attendance = require('./models/attendance');
const Message = require('./models/message');
const { authenticate, authorize } = require('./middleware/authorization');
const connectDB = require('./connections/mongoose');
const jwt = require('jsonwebtoken')

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(cors({
    origin: ['https://smart-attend-puce.vercel.app', 'http://localhost:5173'],
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));

app.get('/loggedIn', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.json({ isLoggedIn: false });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.json({ isLoggedIn: false });
        res.json({ isLoggedIn: true, user });
    });
});

// POST & GET - Signup, Login & Logout
app.post('/signup', signup);
app.post('/login', login);
app.get('/logout', logout);

// Students route with authentication and authorization
app.get('/students', authenticate, async (req, res) => {
    try {
        const students = await User.find({ role: 'student' });
        const studentsWithAttendance = await Promise.all(
            students.map(async (student) => {
                const today = new Date();
                const startOfDay = new Date(today.setHours(0, 0, 0, 0));
                const attendanceRecord = await Attendance.findOne({
                    studentId: student._id,
                    createdAt: { $gte: startOfDay },
                });

                return {
                    _id: student._id,
                    name: student.name,
                    rollNumber: student.rollNumber,
                    email: student.email,
                    attendanceStatus: attendanceRecord ? attendanceRecord.status : 'Not Marked',
                };
            })
        );

        return res.status(200).json(studentsWithAttendance);
    } catch (error) {
        console.error('Error fetching students with attendance:', error);
        res.status(500).json({ message: 'Error fetching attendance records' });
    }
});

// Mark attendance with authentication and authorization
app.post('/attendance', authenticate, authorize(['teacher']), async (req, res) => {
    const { attendanceData } = req.body;

    if (!Array.isArray(attendanceData) || attendanceData.length === 0) {
        return res.status(400).json({ message: 'Invalid input data' });
    }

    try {
        const attendanceRecords = [];
        const alreadyMarkedRollNumbers = [];

        for (let record of attendanceData) {
            const { rollNumber, status } = record;

            if (!rollNumber || !['present', 'absent'].includes(status)) {
                return res.status(400).json({ message: 'Invalid input for roll number or status' });
            }

            const student = await User.findOne({ rollNumber, role: 'student' });
            if (!student) {
                return res.status(404).json({ message: `Student with roll number ${rollNumber} not found` });
            }

            const existingAttendance = await Attendance.findOne({
                studentId: student._id,
                createdAt: { $gte: new Date().setHours(0, 0, 0, 0) },
            });

            if (existingAttendance) {
                alreadyMarkedRollNumbers.push(rollNumber);
            } else {
                const attendance = new Attendance({
                    studentId: student._id,
                    rollNumber,
                    status,
                });
                await attendance.save();
                attendanceRecords.push(attendance);
            }
        }

        if (alreadyMarkedRollNumbers.length > 0) {
            return res.status(400).json({
                message: 'Attendance already marked for students',
                alreadyMarkedRollNumbers,
            });
        }

        return res.status(201).json({ message: 'Attendance marked successfully', attendanceRecords });
    } catch (error) {
        return res.status(500).json({ message: 'Server error', error });
    }
});

// POST - Create a new message with auto-deletion
app.post('/messages', authenticate, authorize(['teacher']), async (req, res) => {
    const { message, duration } = req.body;
    const teacherId = req.user.id;

    if (!message || !duration) {
        return res.status(400).json({ message: 'Message and duration are required' });
    }
    try {
        const newMessage = new Message({
            teacherId,
            message,
            duration,
        });
        await newMessage.save();
        setTimeout(async () => {
            await Message.findByIdAndDelete(newMessage._id);
        }, duration * 60 * 1000);

        res.status(201).json({ message: 'Message created successfully', newMessage });
    } catch (error) {
        res.status(500).json({ message: 'Error creating message', error });
    }
});

// GET - Get active messages for students
app.get('/messages', authenticate, async (req, res) => {
    try {
        const currentTime = new Date();
        const activeMessages = await Message.find({
            startTime: { $lte: currentTime },
            $expr: {
                $gt: [{ $add: ['$startTime', { $multiply: ['$duration', 60000] }] }, currentTime]
            }
        });

        res.status(200).json({ messages: activeMessages });
    } catch (error) {
        console.error('Error fetching active messages:', error);
        res.status(500).json({ message: 'Error fetching messages', error });
    }
});

const port = process.env.PORT || 5000;
connectDB().then(() => {
    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
}).catch((err) => {
    console.error("Failed to connect to the database", err);
    process.exit(1);
});
