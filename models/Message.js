const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MessageSchema = new Schema({
  communityId: { type: Schema.Types.ObjectId, ref: 'Community', required: true }, // Community where the message is posted
  authorId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },      // User who wrote the message
  alias:       { type: String },    // Alias of the author (could store the user’s alias at time of posting for anonymity)
  content:     { type: String, required: true },  // Text content of the message
  timestamp:   { type: Date, default: Date.now }  // Time the message was sent
});

module.exports = mongoose.model('Message', MessageSchema);