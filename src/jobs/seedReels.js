require('dotenv').config();
const mongoose = require('mongoose');
const Reel = require('../modules/reels/reel.model');

const data = require('../../tests/fixtures/reelsData.json');

const insertData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');

    await Reel.deleteMany(); // optional: clear existing
    await Reel.insertMany(data);
    console.log('Data inserted successfully');

    process.exit();
  } catch (err) {
    console.error('Error inserting data:', err);
    process.exit(1);
  }
};

insertData();
