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

const MAX_COMMENT_TEXT = 500;
const MAX_ALIAS_LENGTH = 24;
const MIN_ALIAS_LENGTH = 2;

function newAnonymousAlias() {
  return `anon-${crypto.randomBytes(3).toString('hex')}`;
}

function normalizeAliasKey(alias = '') {
  return String(alias || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeCommentAlias(alias = '') {
  const trimmed = String(alias || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  if (trimmed.length < MIN_ALIAS_LENGTH || trimmed.length > MAX_ALIAS_LENGTH) {
    throw httpError(`Choose a name between ${MIN_ALIAS_LENGTH} and ${MAX_ALIAS_LENGTH} characters`, 400);
  }
  return trimmed;
}

function validateCommentText(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw httpError('Comment text is required', 400);
  if (trimmed.length > MAX_COMMENT_TEXT) {
    throw httpError(`Comments can be ${MAX_COMMENT_TEXT} characters or fewer`, 400);
  }
  return trimmed;
}

function eachPostVoice(post, visit) {
  if (post?.alias) visit({alias: post.alias, userId: post.authorId, kind: 'post'});
  for (const identity of post?.commentIdentities || []) {
    visit({alias: identity.alias, userId: identity.userId, kind: 'identity'});
  }
  for (const comment of post?.comments || []) {
    visit({alias: comment.alias, userId: comment.authorId, kind: 'comment'});
    for (const reply of comment.replies || []) {
      visit({alias: reply.alias, userId: reply.authorId, kind: 'reply'});
    }
  }
}

function findViewerAlias(post, userId) {
  const id = String(userId || '');
  if (!id) return '';
  for (const identity of post?.commentIdentities || []) {
    if (String(identity.userId) === id && identity.alias) return String(identity.alias);
  }
  let found = '';
  eachPostVoice(post, voice => {
    if (!found && String(voice.userId) === id && voice.kind !== 'post') found = String(voice.alias || '');
  });
  return found;
}

function takenAliasKeys(post, {exceptUserId} = {}) {
  const taken = new Set();
  const except = exceptUserId ? String(exceptUserId) : '';
  eachPostVoice(post, voice => {
    if (except && String(voice.userId) === except && voice.kind !== 'post') return;
    const key = normalizeAliasKey(voice.alias);
    if (key) taken.add(key);
  });
  return taken;
}

function suggestPostCommentAlias(post, userId) {
  const taken = takenAliasKeys(post, {exceptUserId: userId});
  const seed = crypto
    .createHash('sha256')
    .update(`${String(post?._id || post?.id || post?.alias || '')}:${String(userId || '')}`)
    .digest('hex');
  let alias = userId ? `anon-${seed.slice(0, 6)}` : newAnonymousAlias();
  let extra = 6;
  while (taken.has(normalizeAliasKey(alias)) && extra < 14) {
    extra += 1;
    alias = userId ? `anon-${seed.slice(0, extra)}` : newAnonymousAlias();
  }
  return alias;
}

function resolvePostCommentAlias(post, userId, requested) {
  const existing = findViewerAlias(post, userId);
  const requestedAlias = String(requested || '').trim() ? normalizeCommentAlias(requested) : '';
  if (requestedAlias) {
    const key = normalizeAliasKey(requestedAlias);
    if (existing && normalizeAliasKey(existing) === key) return existing;
    if (takenAliasKeys(post, {exceptUserId: userId}).has(key)) {
      throw httpError('That name is already used on this post', 409);
    }
    return requestedAlias;
  }
  if (existing) return existing;
  return suggestPostCommentAlias(post, userId);
}

function upsertCommentIdentity(post, userId, alias) {
  if (!Array.isArray(post.commentIdentities)) post.commentIdentities = [];
  const id = String(userId);
  const current = post.commentIdentities.find(item => String(item.userId) === id);
  if (current) current.alias = alias;
  else post.commentIdentities.push({userId: id, alias});
  for (const comment of post.comments || []) {
    if (String(comment.authorId) === id) comment.alias = alias;
    for (const reply of comment.replies || []) {
      if (String(reply.authorId) === id) reply.alias = alias;
    }
  }
  return alias;
}

function countThreadComments(comments = []) {
  return (comments || []).reduce((total, comment) => (
    total + 1 + (Array.isArray(comment.replies) ? comment.replies.length : 0)
  ), 0);
}

function sortCommentsByTime(comments = []) {
  return [...comments].sort((left, right) => {
    const delta = new Date(left.createdAt || 0) - new Date(right.createdAt || 0);
    if (delta) return delta;
    return String(left.id || left._id || '').localeCompare(String(right.id || right._id || ''));
  });
}

function applyPostReaction(post, userId, value) {
  if (!['like', 'dislike', 'love', 'laugh', 'support'].includes(value)) {
    throw httpError('Unsupported reaction', 400);
  }
  if (!Array.isArray(post.reactions)) post.reactions = [];
  const id = String(userId);
  const previous = post.reactions.find(reaction => String(reaction.userId) === id);
  if (previous && previous.value === value) {
    post.reactions = post.reactions.filter(reaction => String(reaction.userId) !== id);
    return post;
  }
  if (previous) previous.value = value;
  else post.reactions.push({userId: id, value});
  return post;
}

function applyPostEngagement(post, userId, action) {
  if (!['like', 'dislike'].includes(action)) throw httpError('Unsupported engagement', 400);
  const id = String(userId);
  if (!Array.isArray(post.likedBy)) post.likedBy = [];
  if (!Array.isArray(post.dislikedBy)) post.dislikedBy = [];
  const likes = post.likedBy;
  const dislikes = post.dislikedBy;
  const likeIndex = likes.indexOf(id);
  const dislikeIndex = dislikes.indexOf(id);
  if (action === 'like') {
    if (likeIndex >= 0) likes.splice(likeIndex, 1);
    else {
      likes.push(id);
      if (dislikeIndex >= 0) dislikes.splice(dislikeIndex, 1);
    }
  } else if (dislikeIndex >= 0) dislikes.splice(dislikeIndex, 1);
  else {
    dislikes.push(id);
    if (likeIndex >= 0) likes.splice(likeIndex, 1);
  }
  post.likes = likes.length;
  post.dislikes = dislikes.length;
  return post;
}

function applyCommentReport(target, userId, {reason, context} = {}) {
  applyCommentEngagement(target, userId, 'report');
  if (!Array.isArray(target.reports)) target.reports = [];
  const id = String(userId);
  const already = target.reports.some(report => String(report.reporterId) === id);
  if (!already) {
    target.reports.push({
      reporterId: id,
      reason: String(reason || 'other').trim().slice(0, 80) || 'other',
      createdAt: new Date(),
      context: String(context || '').trim().slice(0, 1000),
    });
  }
  return target;
}

function applyQueueVote(post, userId, value) {
  if (![1, -1].includes(value)) throw httpError('Vote must be 1 or -1', 400);
  if (!Array.isArray(post.voters)) post.voters = [];
  const previous = post.voters.find(vote => String(vote.userId) === String(userId));
  // Sticky: tapping the same vote again does not undo it.
  if (previous && Number(previous.value) === value) return post;
  post.score = Number(post.score || 0) + value - (previous?.value || 0);
  if (previous) previous.value = value;
  else post.voters.push({userId: String(userId), value});
  return post;
}

function countQueueVotes(post = {}) {
  const voters = Array.isArray(post.voters) ? post.voters : [];
  return {
    upvotes: voters.filter(vote => Number(vote.value) === 1).length,
    downvotes: voters.filter(vote => Number(vote.value) === -1).length,
  };
}

/** Highest upvotes first; when tied, fewer downvotes ranks higher. */
function sortQueuePosts(posts = []) {
  return [...posts].sort((left, right) => {
    const a = countQueueVotes(left);
    const b = countQueueVotes(right);
    if (b.upvotes !== a.upvotes) return b.upvotes - a.upvotes;
    if (a.downvotes !== b.downvotes) return a.downvotes - b.downvotes;
    return new Date(left.createdAt || 0) - new Date(right.createdAt || 0);
  });
}

function resetQueueVotes(post) {
  post.voters = [];
  post.score = 0;
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

const DEFAULT_FEED_PAGE_SIZE = 20;
const MAX_FEED_PAGE_SIZE = 50;

function normalizeFeedPageSize(limit) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed)) return DEFAULT_FEED_PAGE_SIZE;
  return Math.min(MAX_FEED_PAGE_SIZE, Math.max(1, Math.floor(parsed)));
}

/**
 * Cursor page for community published feed.
 * `before` is an ISO timestamp of the oldest post already loaded (exclusive).
 * Returns newest-first rows for the page, plus nextCursor when more older posts exist.
 */
function buildCommunityFeedQuery(communityId, {before} = {}) {
  const query = {
    communityId: String(communityId),
    state: 'published',
  };
  if (before) {
    const beforeAt = new Date(before);
    if (!Number.isNaN(beforeAt.getTime())) {
      query.publishedAt = {$lt: beforeAt};
    }
  }
  return query;
}

function communityFeedSort({before} = {}) {
  // First page keeps pinned posts near the top; older pages are pure chronology.
  if (before) return {publishedAt: -1, createdAt: -1, _id: -1};
  return {pinned: -1, publishedAt: -1, createdAt: -1, _id: -1};
}

function paginateCommunityFeedRows(rows, limit) {
  const pageSize = normalizeFeedPageSize(limit);
  const hasMore = rows.length > pageSize;
  const posts = hasMore ? rows.slice(0, pageSize) : rows;
  const oldest = posts[posts.length - 1];
  const nextCursor = hasMore && oldest?.publishedAt
    ? new Date(oldest.publishedAt).toISOString()
    : null;
  return {posts, nextCursor, hasMore};
}

module.exports = {
  IMAGE_TYPES,
  MAX_COMMUNITY_IMAGE_BYTES,
  MAX_COMMUNITY_VIDEO_BYTES,
  MAX_COMMUNITY_VIDEO_SECONDS,
  DEFAULT_FEED_PAGE_SIZE,
  MAX_FEED_PAGE_SIZE,
  VIDEO_TYPES,
  MAX_ALIAS_LENGTH,
  MAX_COMMENT_TEXT,
  MIN_ALIAS_LENGTH,
  applyCommentEngagement,
  applyCommentReport,
  applyPostReaction,
  applyPostEngagement,
  applyQueueVote,
  countQueueVotes,
  sortQueuePosts,
  resetQueueVotes,
  buildCommunityFeedQuery,
  communityFeedSort,
  countThreadComments,
  findViewerAlias,
  httpError,
  newAnonymousAlias,
  normalizeCommentAlias,
  normalizeFeedPageSize,
  paginateCommunityFeedRows,
  resolvePostCommentAlias,
  sortCommentsByTime,
  sortCommentsLikeLegacy,
  sortRepliesOldestFirst,
  suggestPostCommentAlias,
  upsertCommentIdentity,
  validateCommentText,
  validateCommunityContent,
  validateUploadedCommunityMedia,
};
