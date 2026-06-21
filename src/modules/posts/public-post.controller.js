const defaultPostService = require('./public-post.service');

function sendError(res, err) {
  return res.status(err.statusCode || 500).json({
    error: err.message || 'Internal server error',
  });
}

function createPublicPostController(postService = defaultPostService) {
  return {
    createPost: async (req, res) => {
      try {
        const post = await postService.createPost(req.body || {}, {
          user: req.user,
          files: req.files || [],
        });
        return res.status(201).json({post});
      } catch (err) {
        return sendError(res, err);
      }
    },

    getFeed: async (req, res) => {
      try {
        const result = await postService.listFeed(req.query || {}, {
          user: req.user,
        });
        return res.status(200).json(result);
      } catch (err) {
        return sendError(res, err);
      }
    },

    getMyPosts: async (req, res) => {
      try {
        const result = await postService.listUserPosts(req.user.id, req.query || {}, {
          user: req.user,
        });
        return res.status(200).json(result);
      } catch (err) {
        return sendError(res, err);
      }
    },

    getUserPosts: async (req, res) => {
      try {
        const result = await postService.listUserPosts(req.params.userId, req.query || {}, {
          user: req.user,
        });
        return res.status(200).json(result);
      } catch (err) {
        return sendError(res, err);
      }
    },

    likePost: async (req, res) => {
      try {
        const result = await postService.likePost(req.params.postId, {
          user: req.user,
        });
        return res.status(200).json(result);
      } catch (err) {
        return sendError(res, err);
      }
    },

    unlikePost: async (req, res) => {
      try {
        const result = await postService.unlikePost(req.params.postId, {
          user: req.user,
        });
        return res.status(200).json(result);
      } catch (err) {
        return sendError(res, err);
      }
    },

    getEngagementStatus: async (req, res) => {
      try {
        const result = await postService.getPostEngagementStatus(req.params.postId, {
          user: req.user,
        });
        return res.status(200).json(result);
      } catch (err) {
        return sendError(res, err);
      }
    },
  };
}

module.exports = createPublicPostController;
