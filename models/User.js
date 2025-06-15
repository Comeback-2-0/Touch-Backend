const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  uid: String,
  name: String,
  email: { type: String, unique: true },
  photo: String,
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);