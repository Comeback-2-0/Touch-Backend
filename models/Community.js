const mongoose = require('mongoose');

const communitySchema = new mongoose.Schema({
  name: { type: String, required: true },
  membersCount: { type: Number, default: 0 },
  image: { type: String }
});

module.exports = mongoose.model('Community', communitySchema);
