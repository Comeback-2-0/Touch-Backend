// server.js
require("dotenv").config(); // Load variables from .env
const connectDB = require("./database/db"); // centralised connection helper
const app = require("./app"); // Express instance
const http = require("http");
const configureSocketServer = require("./sockets/socketServer");

const PORT = process.env.PORT || 3333;

(async function startServer() {
  try {
    await connectDB();
    console.log("MongoDB connected");

    // Start cron jobs
    require("./jobs/cron");
    console.log("Cron job initialized");

    // Start the HTTP server.
    const httpServer = http.createServer(app);

    configureSocketServer(httpServer);

    httpServer.listen(PORT, () =>
      console.log(`Server with socket.io running on port ${PORT}`)
    );

    // Graceful shutdown handlers.
    const gracefulExit = async () => {
      console.log("\nShutting down gracefully...");
      try {
        await httpServer.close(); // close HTTP server first
        await require("mongoose").connection.close(); // close MongoDB connection
        console.log("MongoDB connection closed");
        process.exit(0);
      } catch (err) {
        console.error("Error during shutdown:", err);
        process.exit(1);
      }
    };

    process.on("SIGINT", gracefulExit); // Ctrl-C
    process.on("SIGTERM", gracefulExit); // kill command / Heroku dyno restart
    process.on("unhandledRejection", (err) => {
      console.error("Unhandled Promise rejection:", err);
      gracefulExit();
    });
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    process.exit(1); // Exit with failure
  }
})();
