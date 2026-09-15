const crypto = require('crypto');

const MAX_COMMUNITY_VIDEO_BYTES = 25 * 1024 * 1024;
const MAX_COMMUNITY_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_COMMUNITY_VIDEO_SECONDS = 30;

function httpError(message, statusCode) {
  return Object.assign(new Error(message), {statusCode});
}

function validateCommunityContent({text = '', files = []}) {
  if (!String(text).trim() && files.length === 0) {
    throw httpError('A post needs text or one media item', 400);
  }
  if (files.length > 1) throw httpError('A community post can include one media item', 400);
  const file = files[0];
  if (!file) return;
  if (IMAGE_TYPES.has(file.mimetype)) {
    if (file.size > MAX_COMMUNITY_IMAGE_BYTES) throw httpError('Image, meme, or sticker must be 5 MB or smaller', 400);
    return;
  }
  if (VIDEO_TYPES.has(file.mimetype)) {
    if (file.size > MAX_COMMUNITY_VIDEO_BYTES) throw httpError('Video must be 25 MB or smaller', 400);
    return;
  }
  throw httpError('Unsupported community media type', 400);
}

function validateUploadedCommunityMedia(upload, mimeType) {
  if (VIDEO_TYPES.has(mimeType) && Number(upload?.duration || 0) > MAX_COMMUNITY_VIDEO_SECONDS) throw httpError('Video must be 30 seconds or shorter', 400);
}

function newAnonymousAlias() {
  return `anon-${crypto.randomBytes(3).toString('hex')}`;
}

function applyQueueVote(post, userId, value) {
  if (![1, -1].includes(value)) throw httpError('Vote must be 1 or -1', 400);
  if (!Array.isArray(post.voters)) post.voters = [];
  const previous = post.voters.find(vote => String(vote.userId) === String(userId));
  post.score = Number(post.score || 0) + value - (previous?.value || 0);
  if (previous) previous.value = value;
  else post.voters.push({userId: String(userId), value});
  return post;
}

function ensureEngagementArrays(target) {
  if (!Array.isArray(target.likedBy)) target.likedBy = [];
  if (!Array.isArray(target.dislikedBy)) target.dislikedBy = [];
  if (!Array.isArray(target.reportedBy)) target.reportedBy = [];
  if (typeof target.likes !== 'number') target.likes = target.likedBy.length;
  if (typeof target.dislikes !== 'number') target.dislikes = target.dislikedBy.length;
  return target;
}

/** Legacy comment engagement: toggle like/dislike with mutual exclusion; report is append-only. */
function applyCommentEngagement(target, userId, action) {
  const id = String(userId);
  ensureEngagementArrays(target);
  const liked = target.likedBy.map(String);
  const disliked = target.dislikedBy.map(String);
  const reported = target.reportedBy.map(String);

  if (action === 'like') {
    if (liked.includes(id)) {
      target.likedBy = liked.filter(u => u !== id);
      target.likes = Math.max(0, Number(target.likes || 0) - 1);
    } else {
      target.likedBy = [...liked, id];
      target.likes = Number(target.likes || 0) + 1;
      if (disliked.includes(id)) {
        target.dislikedBy = disliked.filter(u => u !== id);
        target.dislikes = Math.max(0, Number(target.dislikes || 0) - 1);
      }
    }
    return target;
  }

  if (action === 'dislike') {
    if (disliked.includes(id)) {
      target.dislikedBy = disliked.filter(u => u !== id);
      target.dislikes = Math.max(0, Number(target.dislikes || 0) - 1);
    } else {
      target.dislikedBy = [...disliked, id];
      target.dislikes = Number(target.dislikes || 0) + 1;
      if (liked.includes(id)) {
        target.likedBy = liked.filter(u => u !== id);
        target.likes = Math.max(0, Number(target.likes || 0) - 1);
      }
    }
    return target;
  }

  if (action === 'report') {
    if (!reported.includes(id)) target.reportedBy = [...reported, id];
    return target;
  }

  throw httpError('Unsupported comment action', 400);
}

function sortCommentsLikeLegacy(comments = []) {
  return [...comments].sort((left, right) => {
    const likeDiff = Number(right.likes || 0) - Number(left.likes || 0);
    if (likeDiff) return likeDiff;
    return (right.replies?.length || 0) - (left.replies?.length || 0);
  });
}

function sortRepliesOldestFirst(replies = []) {
  return [...replies].sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
}

module.exports = {
  IMAGE_TYPES,
  MAX_COMMUNITY_IMAGE_BYTES,
  MAX_COMMUNITY_VIDEO_BYTES,
  MAX_COMMUNITY_VIDEO_SECONDS,
  VIDEO_TYPES,
  applyCommentEngagement,
  applyQueueVote,
  httpError,
  newAnonymousAlias,
  sortCommentsLikeLegacy,
  sortRepliesOldestFirst,
  validateCommunityContent,
  validateUploadedCommunityMedia,
};
