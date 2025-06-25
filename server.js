const express = require('express');
const mongoose = require('mongoose');
const reelsRoutes = require('./routes/reels.routes');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());

// Connect MongoDB
mongoose.connect('mongodb://localhost:27017/Touch', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log("✅ MongoDB connected");
}).catch((err) => {
  console.error("❌ MongoDB connection failed:", err);
});

// Routes
app.use('/api/reels', reelsRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
});
