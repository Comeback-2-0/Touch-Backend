// socket/index.js
const Message = require('../models/Message');

const socketHandler = (io) => {
  io.on('connection', (socket) => {
    console.log('⚡ New client connected:', socket.id);

    // Join user to specific group room
    socket.on('joinGroup', ({ groupId }) => {
      socket.join(groupId);
      console.log(`📌 User joined group: ${groupId}`);
    });

    // Receive and broadcast message
    socket.on('sendMessage', async ({ groupId, senderUid, senderName, message }) => {
      if (!groupId || !message) return;

      const newMessage = new Message({ groupId, senderUid, senderName, message });

      try {
        await newMessage.save();
        io.to(groupId).emit('receiveMessage', newMessage); // send to all in group
        console.log(`💬 Message sent in ${groupId} by ${senderName}: ${message}`);
      } catch (err) {
        console.error('❌ Message save error:', err);
      }
    });

    // On disconnect
    socket.on('disconnect', () => {
      console.log('👋 Client disconnected:', socket.id);
    });
  });
};

module.exports = socketHandler;
