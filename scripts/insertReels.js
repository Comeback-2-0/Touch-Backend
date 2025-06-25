require('dotenv').config();
const mongoose = require('mongoose');
const Reel = require('../models/Reel');

const data = require('./reelsData.json'); // We'll create this next

const insertData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected');

    await Reel.deleteMany(); // optional: clear existing
    await Reel.insertMany(data);
    console.log('🎉 Data inserted successfully');

    process.exit();
  } catch (err) {
    console.error('❌ Error inserting data:', err);
    process.exit(1);
  }
};

insertData();