const repository = require('./user.repository');
const { validateUsername, normalizeUsername, toBoolean } = require('./user.validation');
const cloudinaryStorage = require('../../storage/cloudinary');

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function publicProfile(user) {
  return {
    id: user._id.toString(),
    name: user.name || '',
    username: user.username || '',
    bio: user.bio || '',
    profilePicture: user.profilePicture || '',
    isPrivate: Boolean(user.isPrivate),
    followersCount: user.followersCount || 0,
    followingCount: user.followingCount || 0,
    postsCount: user.postsCount || 0,
    isProfileComplete: Boolean(user.isProfileComplete),
  };
}

async function getExistingUser(userId) {
  const user = await repository.findById(userId);
  if (!user) {
    throw httpError('User not found', 404);
  }
  return user;
}

async function assertUsernameAvailable(username, userId) {
  const owner = await repository.findUsernameOwner(username, userId);
  if (owner) {
    throw httpError('Username is already taken', 409);
  }
}

function pickProfileFields(input, { requireUsername = false } = {}) {
  const update = {};
  const username = validateUsername(input.username, { required: requireUsername });

  if (username) update.username = username;
  if (Object.prototype.hasOwnProperty.call(input, 'name')) {
    update.name = typeof input.name === 'string' ? input.name.trim() : '';
  }
  if (Object.prototype.hasOwnProperty.call(input, 'bio')) update.bio = input.bio || '';
  if (Object.prototype.hasOwnProperty.call(input, 'isPrivate')) {
    const value = toBoolean(input.isPrivate);
    if (typeof value !== 'boolean') {
      throw httpError('isPrivate must be a boolean', 400);
    }
    update.isPrivate = value;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'profilePicture')) {
    update.profilePicture = input.profilePicture || '';
  }
  if (Object.prototype.hasOwnProperty.call(input, 'profilePicturePublicId')) {
    update.profilePicturePublicId = input.profilePicturePublicId || '';
  }

  return update;
}

async function completeProfile(userId, input) {
  await getExistingUser(userId);
  const update = pickProfileFields(input || {}, { requireUsername: true });
  await assertUsernameAvailable(update.username, userId);

  update.isProfileComplete = true;
  const user = await repository.updateById(userId, update);
  if (!user) throw httpError('User not found', 404);

  return publicProfile(user);
}

async function getCurrentUser(userId) {
  return publicProfile(await getExistingUser(userId));
}

async function updateProfile(userId, input, storage = cloudinaryStorage) {
  const currentUser = await getExistingUser(userId);
  const update = pickProfileFields(input || {});

  if (update.username) {
    await assertUsernameAvailable(update.username, userId);
  }

  const oldPublicId = currentUser.profilePicturePublicId || '';
  const isReplacingProfilePicture = Object.prototype.hasOwnProperty.call(update, 'profilePicturePublicId')
    && update.profilePicturePublicId
    && update.profilePicturePublicId !== oldPublicId;

  const user = await repository.updateById(userId, update);
  if (!user) throw httpError('User not found', 404);

  if (isReplacingProfilePicture && oldPublicId) {
    try {
      await storage.deleteProfileImage(oldPublicId);
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        console.error('Failed to delete previous profile image:', err);
      }
    }
  }

  return publicProfile(user);
}

async function isUsernameAvailable(username) {
  let normalized;
  try {
    normalized = validateUsername(username, { required: true });
  } catch (err) {
    return false;
  }

  const user = await repository.findByUsername(normalized);
  return !user;
}

module.exports = {
  completeProfile,
  getCurrentUser,
  updateProfile,
  isUsernameAvailable,
  publicProfile,
  normalizeUsername,
};
