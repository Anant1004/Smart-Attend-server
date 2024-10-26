const express = require('express');
const morgan = require('morgan');  
const app = express();
const dotenv = require('dotenv');
const cors = require('cors');
const { signup, login, logout } = require('./controllers/authControllers');
const User = require('./models/user');
const Attendance = require('./models/attendance');
const Message = require('./models/message');
const cookieParser = require('cookie-parser');
const { authenticate, authorize} = require('./middleware/authorization');
const connectDB = require ('./connections/mongoose');
dotenv.config();


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser())
app.use(morgan('dev'));  
app.use(cors({
    origin: 'https://smart-attend-puce.vercel.app/',
    credentials: true,
}));


// POST & GET - Signup, Login & logout
app.post('/signup', signup);
app.post('/login', login);
app.get('/logout', logout);


// 
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

// POST - mark the attendance of the student 
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

// POST - Create a new message
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

// GET - Get messages for students (only active ones)
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
    process.exit(1); // Exit with error if DB connection fails
});

