const Message = require('../models/Message');

exports.getMessages = async (req, res) => {
  try {
    const messages = await Message.find({ communityId: req.params.communityId }).sort('createdAt');
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load messages' });
  }
};

exports.createMessage = async (req, res) => {
  const { communityId, content, senderAnonymousId } = req.body;

  try {
    const message = new Message({ communityId, content, senderAnonymousId });
    await message.save();
    res.status(201).json(message);
  } catch (err) {
    res.status(400).json({ error: 'Failed to send message' });
  }
};