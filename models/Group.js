// models/Group.js
const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  groupId: { type: String, required: true, unique: true },
  groupName: { type: String, required: true },
  members: [{ type: String, required: true }], // UIDs of users
}, {
  timestamps: true
});

module.exports = mongoose.model('Group', groupSchema);
