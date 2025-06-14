// app.js
require('dotenv').config();
const express = require('express');
const path = require('path');

const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');
const communityRoutes = require('./routes/communityRoutes');
const messageRoutes = require('./routes/messageRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const authRoutes = require('./routes/authRoutes'); // ✅ NEW
const chatRoutes = require('./routes/chatRoutes'); // ✅ import


const app = express();

app.use(express.json()); // JSON parser

// Mount API routes
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/auth', authRoutes); // ✅ NEW: Firebase auth route
app.use('/api/chat', chatRoutes); // ✅ mount

// Serve index.html on base URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
