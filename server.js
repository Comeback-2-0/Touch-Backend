// server.js
require('dotenv').config();                  // Load env variables
const http = require('http');                // Native HTTP server (needed for Socket.IO)
const mongoose = require('mongoose');        // MongoDB ODM
const connectDB = require('./config/db');    // Central DB connect function
const app = require('./app');                // Express app
const socketHandler = require('./socket');   // Socket.IO chat logic
const socketIO = require('socket.io');
const admin = require('./firebase/admin'); // ✅ reuse already initialized admin
const { getAuth } = require('firebase-admin/auth');
const PORT = process.env.PORT || 3333;

// 🛡️ Initialize Firebase Admin SDK


(async function startServer() {
  try {
    // 1️⃣ Connect to MongoDB
    await connectDB();
    console.log('✅ MongoDB connected');

    // 2️⃣ Create HTTP server
    const server = http.createServer(app);

    // 3️⃣ Setup Socket.IO
    const io = socketIO(server, {
      cors: {
        origin: '*', // change this in production
        methods: ['GET', 'POST'],
      },
    });

    // 4️⃣ Firebase Token Auth Middleware for Socket.IO
    io.use(async (socket, next) => {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error('No auth token provided'));
      }

      try {
        const decodedToken = await getAuth().verifyIdToken(token);
        socket.user = decodedToken; // Attach user info to socket
        next();
      } catch (error) {
        console.error('❌ Invalid Firebase token:', error.message);
        next(new Error('Authentication error'));
      }
    });

    // 5️⃣ Handle chat socket events
    socketHandler(io);

    // 6️⃣ Start HTTP server
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });

    // 7️⃣ Graceful shutdown
    const gracefulExit = () => {
      console.log('\n⏳ Shutting down...');
      server.close(() => {
        mongoose.connection.close(false, () => {
          console.log('🛑 MongoDB connection closed');
          process.exit(0);
        });
      });
    };

    process.on('SIGINT', gracefulExit);
    process.on('SIGTERM', gracefulExit);
    process.on('unhandledRejection', (err) => {
      console.error('🚨 Unhandled Promise rejection:', err);
      gracefulExit();
    });
  } catch (err) {
    console.error('❌ Server start error:', err);
    process.exit(1);
  }
})();
