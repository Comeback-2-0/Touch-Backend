// config/db.js – MongoDB connection setup using Mongoose
const mongoose = require('mongoose');

const connectDB = () => {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/touch';
  return mongoose.connect(uri);      // no extra options needed in Mongoose ≥7
};

// const connectDB = async () => {
//   try {
//     const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/touch', {
//       useNewUrlParser: true,
//       useUnifiedTopology: true,
//       // other options can go here
//     });
//     console.log(`MongoDB connected: ${conn.connection.host}`);
//   } catch (err) {
//     console.error('MongoDB connection error:', err);
//     process.exit(1);  // exit process if unable to connect
//   }
// };

module.exports = connectDB;
