const express = require('express');
const multer = require('multer');
const auth = require('../../middleware/auth');
const feedbackController = require('./feedback.controller');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function handleMulter(req, res, next) {
  upload.single('screenshot')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Screenshot must be 5 MB or smaller'
        : err.message;
      return res.status(400).json({ error: message });
    }
    return next();
  });
}

router.post('/bug-reports', auth, handleMulter, feedbackController.createBugReport);
router.post('/feature-requests', auth, feedbackController.createFeatureRequest);

module.exports = router;
