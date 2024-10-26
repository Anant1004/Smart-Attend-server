const mongoose = require('mongoose');

const connectDB = async (app, port) => {
    try {
        await mongoose.connect(process.env.MONGOOSE_URL,
            {
                useNewUrlParser: true,
                useUnifiedTopology: true
            }
        );
        console.log("Connected to MongoDB successfully.");
    } catch (error) {
        console.error("Failed to connect", error);
    }
};

module.exports = connectDB;
