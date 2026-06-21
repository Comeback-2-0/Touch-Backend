const express = require('express');
const multer = require('multer');
const auth = require('../../middleware/auth');
const createPublicPostController = require('./public-post.controller');
const {
  ALLOWED_POST_IMAGE_TYPES,
  MAX_POST_IMAGES,
  MAX_POST_IMAGE_BYTES,
} = require('./public-post.service');

function fileFilter(req, file, cb) {
  if (!ALLOWED_POST_IMAGE_TYPES.has(file.mimetype)) {
    cb(Object.assign(new Error('Post image must be a JPEG, PNG, or WebP image'), {statusCode: 400}));
    return;
  }
  cb(null, true);
}

function createPublicPostRoutes({postService, postStorage, engagementRepository} = {}) {
  const router = express.Router();
  const defaultService = require('./public-post.service');
  const baseService = postService || defaultService;
  const injectOptions = options => ({
    ...options,
    ...(postStorage ? {storage: postStorage} : {}),
    ...(engagementRepository ? {engagementRepository} : {}),
  });
  const service = {
    ...baseService,
    createPost: baseService.createPost
      ? (payload, options) => baseService.createPost(payload, injectOptions(options))
      : undefined,
    listFeed: baseService.listFeed
      ? (query, options) => baseService.listFeed(query, injectOptions(options))
      : undefined,
    listUserPosts: baseService.listUserPosts
      ? (userId, query, options) => baseService.listUserPosts(userId, query, injectOptions(options))
      : undefined,
    likePost: baseService.likePost
      ? (postId, options) => baseService.likePost(postId, injectOptions(options))
      : undefined,
    unlikePost: baseService.unlikePost
      ? (postId, options) => baseService.unlikePost(postId, injectOptions(options))
      : undefined,
    getPostEngagementStatus: baseService.getPostEngagementStatus
      ? (postId, options) => baseService.getPostEngagementStatus(postId, injectOptions(options))
      : undefined,
  };
  const controller = createPublicPostController(service);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {fileSize: MAX_POST_IMAGE_BYTES, files: MAX_POST_IMAGES},
    fileFilter,
  });

  function postImages(req, res, next) {
    upload.array('images', MAX_POST_IMAGES)(req, res, err => {
      if (err) {
        const isSizeError = err.code === 'LIMIT_FILE_SIZE';
        const isCountError = err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE';
        return res.status(err.statusCode || 400).json({
          error: isSizeError
            ? 'Post image must be 5 MB or smaller'
            : isCountError
              ? 'Post can include up to 10 images'
              : err.message,
        });
      }
      return next();
    });
  }

  router.post('/', auth, postImages, controller.createPost);
  router.get('/feed', auth, controller.getFeed);
  router.get('/me', auth, controller.getMyPosts);
  router.get('/user/:userId', auth, controller.getUserPosts);
  router.post('/:postId/like', auth, controller.likePost);
  router.delete('/:postId/like', auth, controller.unlikePost);
  router.get('/:postId/engagement-status', auth, controller.getEngagementStatus);

  return router;
}

module.exports = createPublicPostRoutes;
