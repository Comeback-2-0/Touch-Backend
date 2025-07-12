// app.js (Express initialization)
const cors = require('cors');
require('dotenv').config();                     // Load .env file if present
const mongoose = require('mongoose');
const express = require('express');
const path = require('path');
const fs = require('fs');

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const communityRoutes = require('./routes/communityRoutes');
const messageRoutes = require('./routes/messageRoutes');
const reelRoutes = require('./routes/reelRoutes');
const postRoutes = require('./routes/postRoutes');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Optional MongoDB connection
// connectDB();
// mongoose.connect('mongodb://127.0.0.1:27017/touchdb', { useNewUrlParser: true, useUnifiedTopology: true })
//   .then(() => console.log('DB Connected'))
//   .catch(err => console.log(err));

// Routes
app.use('/auth', authRoutes);
app.use('/messages', messageRoutes);
app.use('/communities', communityRoutes);
app.use('/api/reels', reelRoutes);  // Mood-based reel feed
app.use('/api/reels', postRoutes);
// Serve static homepage (optional)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Video streaming route (for testing progressive video load)
app.get('/videos/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'public/videos', req.params.filename);
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    const chunkSize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
    };

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    };

    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// ✅ Global error handler (for async/route errors)
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

module.exports = app;
