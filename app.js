// app.js (Express initialization)
require('dotenv').config();                     // Load .env file if present (for MONGO_URI, JWT_SECRET, etc.)
const express = require('express');
const connectDB = require('./config/db');       // Import DB connection function
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');
const communityRoutes = require('./routes/communityRoutes');
const messageRoutes = require('./routes/messageRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();
// connectDB();                                    // Connect to MongoDB (using Mongoose)

// Global middlewares
app.use(express.json());                        // Body parser for JSON
// app.use(cors());                             // Enable CORS if needed for client app
// (Other middlewares like morgan for logging can be added here)

// Register API routes (mount routers)
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);

// Basic route for health check
app.get('/', (req, res) => {
  res.send('Touch API is running');
});

// Start server
const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

module.exports = app;


//  // app.js
// const express = require('express');
// const cors = require('cors');

// const app = express();

// // Middleware
// app.use(cors());
// app.use(express.json());

// // Routes
// app.get('/', (req, res) => {
//   res.send('Touch Backend API is working!');
// });

// module.exports = app;