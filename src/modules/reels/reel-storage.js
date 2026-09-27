const cloudinaryStorage = require('../../storage/cloudinary');

function createReelStorage({upload = cloudinaryStorage.uploadVideo} = {}) {
  return {
    async upload(file) {
      if (!file?.buffer) throw new Error('Reel video file is required');
      const result = await upload(file, {
        folder: process.env.CLOUDINARY_REEL_FOLDER || 'touch/reels',
        resource_type: 'video',
      });
      return {
        url: result.url || result.secure_url,
        publicId: result.publicId || result.public_id,
      };
    },
  };
}

module.exports = {createReelStorage};
