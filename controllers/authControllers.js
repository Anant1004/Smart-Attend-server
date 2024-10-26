const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const validRoles = ['student', 'teacher'];

const generateRandomNumber = () => {
    return Math.floor(10000 + Math.random() * 90000).toString();
};

const signup = async (req, res) => {
    const { name, email, password, rollNumber, role } = req.body;
    if (!name || !email || !password || !role) {
        return res.status(400).json({ message: "All fields are required" });
    }
    if (!validRoles.includes(role)) {
        return res.status(400).json({ message: 'Invalid role. Must be student or teacher.' });
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        let authNumber;
        if (role === 'teacher') {
            let isUnique = false;
            while (!isUnique) {
                authNumber = generateRandomNumber();
                const existingAuthNumber = await User.findOne({ authNumber });
                isUnique = !existingAuthNumber;
            }
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashedPassword, rollNumber, role, authNumber });
        await user.save();
        res.status(201).json({ message: 'User created successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'Error creating user: ' + error.message });
    }
};

const login = async (req, res) => {
    const { email, password, authNumber, role } = req.body;
    if (!email || !password || (role === 'teacher' && !authNumber)) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ message: 'User Not Found' });

        if (user.role === 'teacher' && user.authNumber !== authNumber) {
            return res.status(401).json({ message: 'Unauthorized: Incorrect authentication number' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '5h' });

        res.status(200)
            .cookie('token', token, {
                maxAge: 2 * 60 * 60 * 1000,
                httpOnly: true,
                secure: true,
                sameSite: 'None'
            })
            .json({ message: 'Login successful', token, role: user.role });
    } catch (error) {
        res.status(500).json({ message: 'Error logging in: ' + error.message });
    }
};

const logout = async (req, res) => {
    try {
        return res.status(200).cookie('token', '', { maxAge: 0 }).json({
            message: "Sucess logout"
        });
    } catch (error) {
        res.status(500).json({ message: 'Error in logOut: ' + error.message });
    }
};

module.exports = {
    signup,
    login,
    logout
};
