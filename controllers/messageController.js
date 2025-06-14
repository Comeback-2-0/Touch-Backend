// controllers/messageController.js
const Message = require('../models/Message');

// Fetch all messages for a group
const getGroupMessages = async (req, res) => {
  const { groupId } = req.params;

  if (!groupId) return res.status(400).json({ message: 'Group ID missing' });

  try {
    const messages = await Message.find({ groupId }).sort({ timestamp: 1 }); // oldest first
    res.status(200).json({ messages });
  } catch (error) {
    console.error('Error fetching group messages:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { getGroupMessages };
