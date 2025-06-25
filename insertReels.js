const mongoose = require('mongoose');
const Reel = require('./models/Reel');

mongoose.connect('mongodb://localhost:27017/Touch', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const reels = [
  {
    title: 'Reel 1',
    mood: 'happy',
    mediaURL: 'https://res.cloudinary.com/dxacsyqmv/video/upload/v1750584283/i3gj3zyoo8lzq395mffq.mp4', // 👈 paste real URL
  },
  {
    title: 'Reel 2',
    mood: 'sad',
    mediaURL: 'https://res.cloudinary.com/dxacsyqmv/video/upload/v1750584314/chvn0nnfzandqcagrtfz.mp4',
  },
  {
    title: 'Reel 3',
    mood: 'romantic',
    mediaURL: 'https://res.cloudinary.com/dxacsyqmv/video/upload/v1750584343/uobk7nqv2ytnhvyb5his.mp4',
  },
];

Reel.insertMany(reels)
  .then(() => {
    console.log('✅ Reels inserted successfully!');
    mongoose.connection.close();
  })
  .catch((err) => {
    console.error('❌ Error inserting reels:', err);
  });
