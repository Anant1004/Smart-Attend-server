const mongoose = require('mongoose');

// Define the User schema
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
    },
    role: {
        type: String,
        enum: ['student', 'teacher'], 
        required: [true, 'Role is required'],
    },
    rollNumber: {
        type: String,
        validate: {
            validator: function (v) {
                if (this.role === 'student') {
                    return v && v.trim().length > 0;
                }
                return true; 
            },
            message: 'Roll number is required for students',
        },
    },
    authNumber: {
        type: String,
        unique: true, 
        sparse: true, 
        required: function() {
            return this.role === 'teacher'; 
        },
    },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
