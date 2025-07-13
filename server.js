// server.js
require("dotenv").config(); // Load environment variables
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const userRoutes = require("./routes/userRoutes");

const PORT = process.env.PORT || 3333;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/touch";

// 1️⃣ Create Express app
const app = express();

<<<<<<< HEAD
    // ⏰ Start cron jobs
    require('./utils/cron');
    console.log("🕒 Cron job initialized");

    // 2️⃣ Start the HTTP server ----------------------------------------------
    const httpServer = http.createServer(app);
=======
// 2️⃣ Middlewares
app.use(cors());
app.use(express.json());
>>>>>>> e394255 (Initial commit to Shorya)

// 3️⃣ MongoDB connection
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.connection.once("open", () => {
  console.log("✅ MongoDB connected");
});

// 4️⃣ Routes
app.use("/api", userRoutes); // Example: /api/auth/google

// 5️⃣ Create HTTP server
const httpServer = http.createServer(app);

// 6️⃣ Socket.IO setup
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("🔌 New connected");

  socket.on("joinRoom", (communityId) => {
    socket.join(communityId);
  });

  socket.on("sendMessage", ({ communityId, content, senderAnonymousId }) => {
    io.to(communityId).emit("newMessage", {
      content,
      senderAnonymousId,
      createdAt: new Date(),
    });
  });

  socket.on("disconnect", () => {
    console.log("❌ disconnected");
  });
});

// 7️⃣ Start the server
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

// 8️⃣ Graceful Shutdown
const gracefulExit = () => {
  console.log("\n⏳ Shutting down gracefully...");
  httpServer.close(() => {
    mongoose.connection.close(false, () => {
      console.log("🛑 MongoDB connection closed");
      process.exit(0);
    });
  });
};

process.on("SIGINT", gracefulExit);
process.on("SIGTERM", gracefulExit);
process.on("unhandledRejection", (err) => {
  console.error("🚨 Unhandled Promise rejection:", err);
  gracefulExit();
});
