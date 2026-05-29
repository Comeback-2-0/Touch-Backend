// config/db.js - MongoDB connection setup using Mongoose
const mongoose = require('mongoose');

const connectDB = () => {
  const uri = process.env.MONGO_URI;
  return mongoose.connect(uri);      
};

module.exports = connectDB;
