// server.js
require("dotenv").config(); // Load variables from .env
const { connectDatabases, closeDatabases } = require("./database");
const app = require("./app"); // Express instance
const http = require("http");
const configureSocketServer = require("./sockets/socketServer");

const PORT = process.env.PORT || 3333;

(async function startServer() {
  try {
    const databaseStatus = await connectDatabases();
    console.log("Databases connected", databaseStatus);

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
        await new Promise((resolve, reject) => {
          httpServer.close(err => (err ? reject(err) : resolve()));
        });
        await closeDatabases();
        console.log("Database connections closed");
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
    console.error("Database connection failed:", err);
    process.exit(1); // Exit with failure
  }
})();
