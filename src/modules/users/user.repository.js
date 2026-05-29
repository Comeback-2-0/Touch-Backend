const User = require('./user.model');

function findById(userId) {
  return User.findById(userId);
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

function updateById(userId, update) {
  return User.findByIdAndUpdate(userId, { $set: update }, {
    new: true,
    runValidators: true,
  });
}

module.exports = {
  findById,
  findByUsername,
  findUsernameOwner,
  updateById,
};
