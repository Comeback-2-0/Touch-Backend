// app.js (Express initialization)
require('dotenv').config();
const express = require('express');
const healthRoutes = require('./modules/health/health.routes');
const publicPostRoutes = require('./modules/posts/public-post.routes');
const legacyPostRoutes = require('./modules/posts/post.routes');
const authRoutes = require('./modules/auth/auth.routes');
const communityRoutes = require('./modules/communities/community.routes');
const createCommunityContentRoutes = require('./modules/communities/community-content.routes');
const messageRoutes = require('./modules/chat/message.routes');
const reelRoutes = require('./modules/reels/reel.routes');
const queueRoutes = require('./modules/feed/queue.routes');
const feedEventRoutes = require('./modules/feed/feed-event.routes');
const commentRoutes = require('./modules/comments/comment.routes');
const reelUploadRoutes = require('./modules/reels/reel-upload.routes');
const userRoutes = require('./modules/users/user.routes');
const uploadRoutes = require('./modules/uploads/upload.routes');
const feedbackRoutes = require('./modules/feedback/feedback.routes');
const notificationRoutes = require('./modules/notifications/notification.routes');
const path = require('path');
const bodyParser = require('body-parser');


const app = express();
app.use(express.json());                        // Body parser for JSON

app.use(bodyParser.json()); // to parse JSON
app.use('/health', healthRoutes());
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/messages', messageRoutes);
app.use('/communities', communityRoutes);
app.use('/communities/:communityId/content', createCommunityContentRoutes());
app.use('/posts', publicPostRoutes());
app.use('/legacy/community-posts', legacyPostRoutes);
app.use('/queue', queueRoutes);
app.use('/feed/events', feedEventRoutes());
app.use('/comments', commentRoutes);
app.use('/api/reels', reelRoutes);
app.use('/api/reels', reelUploadRoutes);
app.use('/uploads', uploadRoutes());
app.use('/feedback', feedbackRoutes);
app.use('/notifications', notificationRoutes);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Fallback route to serve index.html for root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/videos/:filename', (req, res) => {
  const filePath = path.join(__dirname, '..', 'public', 'videos', req.params.filename);
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
