// routes/postRoutes.js
const express = require('express');
const router  = express.Router();
const postController = require('../controllers/postController');

// PUBLIC – list all posts (later you’ll add query params for mood, pagination, etc.)
router.get('/', postController.getAllPosts);

// PROTECTED (once auth is ready) – create a post
router.post('/', postController.createPost);

module.exports = router;