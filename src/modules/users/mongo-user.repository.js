const User = require('./user.model');

function findById(userId) {
  return User.findById(userId);
}

function findByEmail(email) {
  return User.findOne({ email });
}

function findByUsername(username) {
  return User.findOne({ username });
}

function findUsernameOwner(username, excludeUserId) {
  const query = { username };
  if (excludeUserId) {
    query._id = { $ne: excludeUserId };
  }
  return User.findOne(query);
}

function create(input) {
  return User.create(input);
}

function updateById(userId, update) {
  return User.findByIdAndUpdate(userId, { $set: update }, {
    new: true,
    runValidators: true,
  });
}

function incrementPostsCount(userId, by = 1) {
  return User.findByIdAndUpdate(userId, { $inc: { postsCount: by } }, {
    new: true,
    runValidators: true,
  });
}

module.exports = {
  findById,
  findByEmail,
  findByUsername,
  findUsernameOwner,
  create,
  updateById,
  incrementPostsCount,
};
