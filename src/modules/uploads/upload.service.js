const cloudinaryStorage = require('../../storage/cloudinary');

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function validateProfilePicture(file) {
  if (!file) {
    throw httpError('profilePicture file is required', 400);
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
    throw httpError('Profile picture must be a JPEG, PNG, or WebP image', 400);
  }

  if (file.size > MAX_PROFILE_IMAGE_BYTES) {
    throw httpError('Profile picture must be 5 MB or smaller', 400);
  }
}

async function uploadProfilePicture(file, storage = cloudinaryStorage) {
  validateProfilePicture(file);
  return storage.uploadProfileImage(file);
}

module.exports = {
  uploadProfilePicture,
  validateProfilePicture,
  ALLOWED_IMAGE_TYPES,
  MAX_PROFILE_IMAGE_BYTES,
};
