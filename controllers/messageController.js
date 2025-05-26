// controllers/messageController.js
exports.getMessages = (req, res) => {
  res.json({ status: 'success', message: `getMessages for ${req.params.communityId} – not implemented yet` });
};
exports.postMessage = (req, res) => {
  res.json({ status: 'success', message: `postMessage to ${req.params.communityId} – not implemented yet` });
};