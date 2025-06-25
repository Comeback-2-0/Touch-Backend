const mongoose = require('mongoose');

const ReelSchema = new mongoose.Schema({
  title: String,
  mood: String,
  mediaURL: String
});

module.exports = mongoose.model('Reel', ReelSchema);
