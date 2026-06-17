const mongoose = require('mongoose');
const PublicPost = require('./public-post.model');
const User = require('../users/user.model');
const cloudinaryStorage = require('../../storage/cloudinary');

const ALLOWED_POST_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_POST_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_POST_IMAGES = 10;
const MAX_POST_TEXT_LENGTH = 2000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function httpError(message, statusCode) {
  return Object.assign(new Error(message), {statusCode});
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validatePostInput({text, files}) {
  if (text.length > MAX_POST_TEXT_LENGTH) {
    throw httpError(`Post text must be ${MAX_POST_TEXT_LENGTH} characters or fewer`, 400);
  }

  if (!text && files.length === 0) {
    throw httpError('Post requires text or image', 400);
  }
}

function validatePostImages(files) {
  if (files.length > MAX_POST_IMAGES) {
    throw httpError('Post can include up to 10 images', 400);
  }

  files.forEach(file => {
    if (!ALLOWED_POST_IMAGE_TYPES.has(file.mimetype)) {
      throw httpError('Post image must be a JPEG, PNG, or WebP image', 400);
    }

    if (file.size > MAX_POST_IMAGE_BYTES) {
      throw httpError('Post image must be 5 MB or smaller', 400);
    }
  });
}

function toAuthorSnapshot(user) {
  return {
    name: user.name || '',
    username: user.username || '',
    profilePicture: user.profilePicture || user.photo || '',
  };
}

function toPublicPost(post) {
  return {
    id: post._id.toString(),
    author: {
      id: post.authorId.toString(),
      ...post.authorSnapshot,
    },
    text: post.text || '',
    media: post.media || [],
    visibility: post.visibility,
    status: post.status,
    engagement: post.engagement,
    moderation: post.moderation,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

async function getAuthor(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw httpError('User not found', 404);
  }
  return user;
}

async function createPost(payload, options = {}) {
  const userId = options.user?.id;
  const storage = options.storage || cloudinaryStorage;
  const text = normalizeText(payload.text);
  const files = options.files || (options.file ? [options.file] : []);

  validatePostImages(files);
  validatePostInput({text, files});

  const user = await getAuthor(userId);
  const media = [];

  for (const file of files) {
    try {
      const uploaded = await storage.uploadPostImage(file);
      media.push({
        type: 'image',
        url: uploaded.url,
        publicId: uploaded.publicId,
        width: uploaded.width || 0,
        height: uploaded.height || 0,
        format: uploaded.format || '',
      });
    } catch (err) {
      throw httpError('Post image upload failed', 500);
    }
  }

  const post = await PublicPost.create({
    authorId: user._id,
    authorSnapshot: toAuthorSnapshot(user),
    text,
    media,
  });
  await User.updateOne({_id: user._id}, {$inc: {postsCount: 1}});
  return toPublicPost(post);
}

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function parseCursor(cursor) {
  if (!cursor) return null;
  const date = new Date(cursor);
  if (Number.isNaN(date.getTime())) {
    throw httpError('Invalid cursor', 400);
  }
  return date;
}

async function listPosts({authorId, limit, cursor}) {
  const normalizedLimit = parseLimit(limit);
  const cursorDate = parseCursor(cursor);
  const query = {
    status: 'active',
    visibility: 'public',
  };

  if (authorId) query.authorId = authorId;
  if (cursorDate) query.createdAt = {$lt: cursorDate};

  const posts = await PublicPost.find(query)
    .sort({createdAt: -1, _id: -1})
    .limit(normalizedLimit + 1);

  const hasMore = posts.length > normalizedLimit;
  const visiblePosts = hasMore ? posts.slice(0, normalizedLimit) : posts;

  return {
    posts: visiblePosts.map(toPublicPost),
    nextCursor: hasMore ? visiblePosts[visiblePosts.length - 1].createdAt.toISOString() : null,
  };
}

async function listFeed(query = {}) {
  return listPosts(query);
}

async function listUserPosts(userId, query = {}) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw httpError('Invalid user id', 400);
  }
  return listPosts({...query, authorId: userId});
}

module.exports = {
  createPost,
  listFeed,
  listUserPosts,
  validatePostImages,
  ALLOWED_POST_IMAGE_TYPES,
  MAX_POST_IMAGE_BYTES,
  MAX_POST_IMAGES,
  MAX_POST_TEXT_LENGTH,
};
