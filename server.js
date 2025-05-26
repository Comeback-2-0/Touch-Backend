// server.js
// ──────────────────────────────────────────────────────────────────────────────
require('dotenv').config();           // Load variables from .env
// const mongoose = require('mongoose'); // ODM
const connectDB = require('./config/db');   // centralised connection helper
const app = require('./app');         // Express instance

const PORT = process.env.PORT || 5000;

// Optional: silence Mongoose’s strictQuery de-precation notice
// mongoose.set('strictQuery', false);

(async function startServer() {
  try {
    // 1️⃣ Connect to MongoDB ---------------------------------------------------
    // await mongoose.connect(process.env.MONGO_URI);
    // console.log('✅ MongoDB connected');
    await connectDB();
    console.log('✅ MongoDB connected');

    // 2️⃣ Start the HTTP server ----------------------------------------------
    const server = app.listen(PORT, () =>
      console.log(`🚀 Server running on port ${PORT}`)
    );

    // 3️⃣ Graceful shutdown handlers -----------------------------------------
    const gracefulExit = () => {
      console.log('\n⏳ Shutting down gracefully...');
      server.close(() => {
        // mongoose.connection.close(false, () => {
        //   console.log('🛑 MongoDB connection closed');
        //   process.exit(0);
        // });
        // close the same connection used in connectDB()
        require('mongoose').connection.close(false, () => {
        console.log('🛑 MongoDB connection closed');
        process.exit(0);
        });
      });
    };

    process.on('SIGINT', gracefulExit);      // Ctrl-C
    process.on('SIGTERM', gracefulExit);     // kill command / Heroku dyno restart
    process.on('unhandledRejection', err => {
      console.error('🚨 Unhandled Promise rejection:', err);
      gracefulExit();
    });
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err);
    process.exit(1); // Exit with failure
  }
})();