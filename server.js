// server.js
require("dotenv").config(); // Load variables from .env
const connectDB = require("./config/db"); // centralised connection helper
const app = require("./app"); // Express instance
const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3333;

(async function startServer() {
  try {
    await connectDB();
    console.log("✅ MongoDB connected");

    // ⏰ Start cron jobs
    require("./utils/cron");
    console.log("🕒 Cron job initialized");

    // 2️⃣ Start the HTTP server ----------------------------------------------
    const httpServer = http.createServer(app);

    const io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    io.on("connection", (socket) => {
      console.log("🔌 New user connected");

      socket.on("joinRoom", (communityId) => {
        socket.join(communityId);
      });

      socket.on(
        "sendMessage",
        ({ communityId, content, senderAnonymousId }) => {
          io.to(communityId).emit("newMessage", {
            content,
            senderAnonymousId,
            createdAt: new Date(),
          });
        }
      );

      socket.on("disconnect", () => {
        console.log("❌ User disconnected");
      });
    });

    httpServer.listen(PORT, () =>
      console.log(`🚀 Server with socket.io running on port ${PORT}`)
    );

    // 3️⃣ Graceful shutdown handlers -----------------------------------------
    const gracefulExit = async () => {
      console.log("\n⏳ Shutting down gracefully...");
      try {
        await httpServer.close(); // close HTTP server first
        await require("mongoose").connection.close(); // close MongoDB connection
        console.log("🛑 MongoDB connection closed");
        process.exit(0);
      } catch (err) {
        console.error("❌ Error during shutdown:", err);
        process.exit(1);
      }
    };

    process.on("SIGINT", gracefulExit); // Ctrl-C
    process.on("SIGTERM", gracefulExit); // kill command / Heroku dyno restart
    process.on("unhandledRejection", (err) => {
      console.error("🚨 Unhandled Promise rejection:", err);
      gracefulExit();
    });
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1); // Exit with failure
  }
})();
