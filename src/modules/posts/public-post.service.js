const mongoose = require('mongoose');
const PublicPost = require('./public-post.model');
const defaultUserRepository = require('../users/user.repository');
const {createEngagementRepository} = require('../graph/engagement.repository');
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

function entityId(value) {
  return String(value.id || value._id || value);
}

function postId(post) {
  return post._id?.toString ? post._id.toString() : String(post.id || post._id);
}

function engagementCount(post, key) {
  return Number(post.engagement?.[key] || 0);
}

function toPublicPost(post, viewerEngagement = {liked: false}) {
  return {
    id: postId(post),
    author: {
      id: String(post.authorId),
      ...post.authorSnapshot,
    },
    text: post.text || '',
    media: post.media || [],
    visibility: post.visibility,
    status: post.status,
    engagement: post.engagement,
    moderation: post.moderation,
    viewerEngagement: {
      liked: Boolean(viewerEngagement.liked),
    },
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

function createDefaultPostRepository() {
  return {
    create(input) {
      return PublicPost.create(input);
    },
    find(query) {
      return PublicPost.find(query);
    },
    async findPage({authorId, limit, cursor}) {
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
        posts: visiblePosts,
        nextCursor: hasMore ? visiblePosts[visiblePosts.length - 1].createdAt.toISOString() : null,
      };
    },
    findActivePublicById(id) {
      if (!mongoose.isValidObjectId(id)) return null;
      return PublicPost.findOne({
        _id: id,
        status: 'active',
        visibility: 'public',
      });
    },
    incrementLikesCount(id, by = 1) {
      return PublicPost.findByIdAndUpdate(
        id,
        {$inc: {'engagement.likesCount': by}},
        {new: true},
      );
    },
    decrementLikesCount(id) {
      if (!mongoose.isValidObjectId(id)) return null;
      return PublicPost.findOneAndUpdate(
        {_id: id},
        [
          {
            $set: {
              'engagement.likesCount': {
                $max: [
                  0,
                  {$add: [{$ifNull: ['$engagement.likesCount', 0]}, -1]},
                ],
              },
            },
          },
        ],
        {new: true},
      );
    },
  };
}

async function getAuthor(userId, userRepository) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw httpError('User not found', 404);
  }
  return user;
}

async function createPost(payload, options = {}) {
  const userId = options.user?.id;
  const storage = options.storage || cloudinaryStorage;
  const userRepository = options.userRepository || defaultUserRepository;
  const postRepository = options.postRepository || createDefaultPostRepository();
  const text = normalizeText(payload.text);
  const files = options.files || (options.file ? [options.file] : []);

  validatePostImages(files);
  validatePostInput({text, files});

  const user = await getAuthor(userId, userRepository);
  const authorId = entityId(user);
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

  const post = await postRepository.create({
    authorId,
    authorSnapshot: toAuthorSnapshot(user),
    text,
    media,
  });
  await userRepository.incrementPostsCount(authorId, 1);
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

function requireAuthenticatedUser(options) {
  const userId = options.user?.id;
  if (!userId) {
    throw httpError('Authentication required', 401);
  }
  return String(userId);
}

async function likedPostIdSet(posts, options) {
  const userId = options.user?.id;
  if (!userId || posts.length === 0) return new Set();

  const engagementRepository = options.engagementRepository || createEngagementRepository();
  const likedIds = await engagementRepository.likedContentIds({
    userId,
    contentType: 'post',
    contentIds: posts.map(postId),
  });

  return new Set(likedIds.map(String));
}

async function listPosts({authorId, limit, cursor}, options = {}) {
  const postRepository = options.postRepository || createDefaultPostRepository();
  const result = await postRepository.findPage({authorId, limit, cursor});
  const likedIds = await likedPostIdSet(result.posts, options);

  return {
    posts: result.posts.map(post => toPublicPost(post, {liked: likedIds.has(postId(post))})),
    nextCursor: result.nextCursor,
  };
}

async function listFeed(query = {}, options = {}) {
  return listPosts(query, options);
}

async function listUserPosts(userId, query = {}, options = {}) {
  if (!userId || typeof userId !== 'string') {
    throw httpError('Invalid user id', 400);
  }
  return listPosts({...query, authorId: userId}, options);
}

async function findActivePublicPost(postIdValue, postRepository) {
  const post = await postRepository.findActivePublicById(postIdValue);
  if (!post) {
    throw httpError('Post not found', 404);
  }
  return post;
}

async function likePost(postIdValue, options = {}) {
  const userId = requireAuthenticatedUser(options);
  const postRepository = options.postRepository || createDefaultPostRepository();
  const engagementRepository = options.engagementRepository || createEngagementRepository();
  const post = await findActivePublicPost(postIdValue, postRepository);
  const changed = await engagementRepository.likeContentIfAbsent({
    userId,
    contentId: postIdValue,
    contentType: 'post',
  });
  const countSource = changed
    ? await postRepository.incrementLikesCount(postIdValue, 1)
    : post;

  return {
    liked: true,
    likesCount: engagementCount(countSource || post, 'likesCount'),
  };
}

async function unlikePost(postIdValue, options = {}) {
  const userId = requireAuthenticatedUser(options);
  const postRepository = options.postRepository || createDefaultPostRepository();
  const engagementRepository = options.engagementRepository || createEngagementRepository();
  const post = await findActivePublicPost(postIdValue, postRepository);
  const changed = await engagementRepository.unlikeContentIfPresent({
    userId,
    contentId: postIdValue,
    contentType: 'post',
  });
  const countSource = changed
    ? await postRepository.decrementLikesCount(postIdValue)
    : post;

  return {
    liked: false,
    likesCount: engagementCount(countSource || post, 'likesCount'),
  };
}

async function getPostEngagementStatus(postIdValue, options = {}) {
  const userId = requireAuthenticatedUser(options);
  const postRepository = options.postRepository || createDefaultPostRepository();
  const engagementRepository = options.engagementRepository || createEngagementRepository();
  const post = await findActivePublicPost(postIdValue, postRepository);
  const liked = await engagementRepository.hasLiked({
    userId,
    contentId: postIdValue,
    contentType: 'post',
  });

  return {
    liked,
    likesCount: engagementCount(post, 'likesCount'),
  };
}

module.exports = {
  createPost,
  getPostEngagementStatus,
  likePost,
  listFeed,
  listUserPosts,
  unlikePost,
  validatePostImages,
  ALLOWED_POST_IMAGE_TYPES,
  MAX_POST_IMAGE_BYTES,
  MAX_POST_IMAGES,
  MAX_POST_TEXT_LENGTH,
};
