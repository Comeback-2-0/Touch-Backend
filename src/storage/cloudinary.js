const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function uploadBuffer(file) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: process.env.CLOUDINARY_PROFILE_FOLDER || 'touch/profile-pictures',
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

async function uploadProfileImage(file) {
  const result = await uploadBuffer(file);
  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
}

async function deleteProfileImage(publicId) {
  if (!publicId) return null;
  return cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
}

module.exports = {
  uploadProfileImage,
  deleteProfileImage,
};
