// server.js
require("dotenv").config(); // Load environment variables
const connectDB = require("./config/db"); // MongoDB connection helper
const app = require("./app"); // Express app instance (cleanly structured)
const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 5000;

(async function startServer() {
  try {
    // 1️⃣ Connect to MongoDB Atlas
    await connectDB();
    console.log("✅ MongoDB connected");

    // 2️⃣ Load cron jobs (if any)
    require("./utils/cron");
    console.log("🕒 Cron job initialized");

    // 3️⃣ Create HTTP server and bind socket.io
    const httpServer = http.createServer(app);

    const io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    // 4️⃣ Socket.IO Logic
    io.on("connection", (socket) => {
      console.log("🔌 New user connected");

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
        console.log("❌ User disconnected");
      });
    });

    // 5️⃣ Start Server
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server with socket.io running on http://localhost:${PORT}`);
    });

    // 6️⃣ Graceful Shutdown
    const gracefulExit = () => {
      console.log("\n⏳ Shutting down gracefully...");
      httpServer.close(() => {
        require("mongoose").connection.close(false, () => {
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
  } catch (err) {
    console.error("❌ Server startup failed:", err.message);
    process.exit(1);
  }
})();
