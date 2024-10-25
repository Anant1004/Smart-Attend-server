const mongoose = require('mongoose');

const connectDB = async (app, port) => {
    try {
        await mongoose.connect(process.env.MONGOOSE_URL);
        console.log("Connected to MongoDB successfully.");
        
        app.listen(port, (err) => {
            if (err) console.log(err);
            console.log(`Server running on port ${port}`);
        });
    } catch (error) {
        console.error("Failed to connect", error);
    }
};

module.exports = connectDB;
