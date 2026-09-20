const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function uploadBuffer(file, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      }
    );

    stream.end(file.buffer);
  });
}

function uploadCommunityBuffer(file, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {folder, resource_type: file.mimetype.startsWith('video/') ? 'video' : 'image'},
      (error, result) => error ? reject(error) : resolve(result),
    );
    stream.end(file.buffer);
  });
}

async function uploadCommunityMedia(file) {
  const result = await uploadCommunityBuffer(file, process.env.CLOUDINARY_COMMUNITY_FOLDER || 'touch/community');
  return {url: result.secure_url, publicId: result.public_id, duration: Number(result.duration || 0)};
}

async function deleteCommunityMedia(publicId, isVideo = false) {
  if (!publicId) return null;
  return cloudinary.uploader.destroy(publicId, {resource_type: isVideo ? 'video' : 'image'});
}

async function uploadCommunityImage(file) {
  const result = await uploadBuffer(file, process.env.CLOUDINARY_COMMUNITY_AVATAR_FOLDER || 'touch/community-avatars');
  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
}

async function uploadProfileImage(file) {
  const result = await uploadBuffer(file, process.env.CLOUDINARY_PROFILE_FOLDER || 'touch/profile-pictures');
  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
}

async function uploadFeedbackImage(file) {
  const result = await uploadBuffer(file, process.env.CLOUDINARY_FEEDBACK_FOLDER || 'touch/feedback-screenshots');
  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
}

async function uploadPostImage(file) {
  const result = await uploadBuffer(file, process.env.CLOUDINARY_POST_FOLDER || 'touch/posts');
  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width || 0,
    height: result.height || 0,
    format: result.format || '',
  };
}

async function deleteProfileImage(publicId) {
  if (!publicId) return null;
  return cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
}

module.exports = {
  uploadProfileImage,
  uploadFeedbackImage,
  uploadPostImage,
  uploadCommunityImage,
  uploadCommunityMedia,
  deleteCommunityMedia,
  deleteProfileImage,
};
