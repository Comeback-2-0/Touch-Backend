// app.js (Express initialization)
require('dotenv').config();
const express = require('express');
const postRoutes = require('./routes/postRoutes');
const authRoutes = require('./routes/auth');
const communityRoutes = require('./routes/communityRoutes');
const messageRoutes = require('./routes/messageRoutes');
const reelRoutes = require('./routes/reelRoutes');
const queueRoutes = require('./routes/queueRoutes');
const commentRoutes = require('./routes/commentRoutes');
const groupRoutes = require('./routes/groupRoutes');
const reelUploadRoutes = require('./routes/reelUploadRoutes');
const path = require('path');
const bodyParser = require('body-parser');


const app = express();
app.use(express.json());                        // Body parser for JSON

app.use(bodyParser.json()); // to parse JSON
app.use('/auth', authRoutes);
app.use('/messages', messageRoutes);
app.use('/communities', communityRoutes);
app.use('/groups', groupRoutes); 
app.use('/posts', postRoutes);
app.use('/queue', queueRoutes);
app.use('/comments', commentRoutes);
app.use('/api/reels', reelRoutes);
app.use('/api/reels', reelUploadRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Fallback route to serve index.html for root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/videos/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'public/videos', req.params.filename);
  const fs = require('fs');

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


module.exports = app;