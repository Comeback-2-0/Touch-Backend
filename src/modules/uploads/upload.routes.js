const express = require('express');
const multer = require('multer');
const auth = require('../../middleware/auth');
const createUploadController = require('./upload.controller');
const { ALLOWED_IMAGE_TYPES, MAX_PROFILE_IMAGE_BYTES } = require('./upload.service');

function fileFilter(req, file, cb) {
  if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
    cb(Object.assign(new Error('Profile picture must be a JPEG, PNG, or WebP image'), { statusCode: 400 }));
    return;
  }
  cb(null, true);
}

function createUploadRoutes({ uploadService } = {}) {
  const router = express.Router();
  const controller = createUploadController(uploadService);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PROFILE_IMAGE_BYTES },
    fileFilter,
  });

  router.post('/profile-picture', auth, (req, res) => {
    upload.single('profilePicture')(req, res, (err) => {
      if (err) {
        const isSizeError = err.code === 'LIMIT_FILE_SIZE';
        return res.status(err.statusCode || 400).json({
          error: isSizeError ? 'Profile picture must be 5 MB or smaller' : err.message,
        });
      }
      return controller.uploadProfilePicture(req, res);
    });
  });

  return router;
}

module.exports = createUploadRoutes;
