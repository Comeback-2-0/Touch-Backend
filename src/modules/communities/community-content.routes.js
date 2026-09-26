const express = require('express');
const multer = require('multer');
const auth = require('../../middleware/auth');
const CommunityContent = require('./community-content.model');
const communityRepository = require('./community.repository');
const {canManageCommunity, canParticipate, canViewCommunityContent} = require('./community-access');
const {
  httpError,
  newAnonymousAlias,
  validateCommunityContent,
  validateUploadedCommunityMedia,
  applyQueueVote,
  applyCommentEngagement,
  applyCommentReport,
  applyPostReaction,
  applyPostEngagement,
  sortCommentsLikeLegacy,
  sortCommentsByTime,
  sortRepliesOldestFirst,
  sortQueuePosts,
  resetQueueVotes,
  buildCommunityFeedQuery,
  communityFeedSort,
  normalizeFeedPageSize,
  paginateCommunityFeedRows,
  countThreadComments,
  resolvePostCommentAlias,
  upsertCommentIdentity,
  validateCommentText,
  normalizeCommentAlias,
} = require('./community-content.service');
const {uploadCommunityMedia, deleteCommunityMedia} = require('../../storage/cloudinary');
const {selectEligibleQueuePost} = require('./community-publication.service');
const {scheduleCommunityTrendingRecompute} = require('./community-trending');

function sendError(res, err) {
  return res.status(err.statusCode || 500).json({error: err.message || 'Unable to complete community action'});
}

function safeEngagement(target, viewerId) {
  const likedBy = (target.likedBy || []).map(String);
  const dislikedBy = (target.dislikedBy || []).map(String);
  const reportedBy = (target.reportedBy || []).map(String);
  const viewer = viewerId ? String(viewerId) : '';
  return {
    likes: Number(target.likes || 0),
    dislikes: Number(target.dislikes || 0),
    likedByMe: Boolean(viewer && likedBy.includes(viewer)),
    dislikedByMe: Boolean(viewer && dislikedBy.includes(viewer)),
    reportedByMe: Boolean(viewer && reportedBy.includes(viewer)),
  };
}

function safePostReactions(content, viewerId) {
  const totals = {like: 0, love: 0, laugh: 0, support: 0};
  const viewer = viewerId ? String(viewerId) : '';
  let myReaction = '';
  for (const reaction of content.reactions || []) {
    const value = String(reaction.value || '');
    if (Object.prototype.hasOwnProperty.call(totals, value)) totals[value] += 1;
    if (viewer && String(reaction.userId) === viewer) myReaction = value;
  }
  return {totals, myReaction};
}

function safeReply(reply, viewerId) {
  return {
    id: String(reply._id),
    alias: reply.alias,
    text: reply.text,
    createdAt: reply.createdAt,
    mine: Boolean(viewerId && String(reply.authorId) === String(viewerId)),
    ...safeEngagement(reply, viewerId),
  };
}

function safeComment(comment, viewerId) {
  return {
    id: String(comment._id),
    alias: comment.alias,
    text: comment.text,
    createdAt: comment.createdAt,
    mine: Boolean(viewerId && String(comment.authorId) === String(viewerId)),
    ...safeEngagement(comment, viewerId),
    replies: sortRepliesOldestFirst(comment.replies || []).map(reply => safeReply(reply, viewerId)),
  };
}

function sortCommentsForViewer(comments = [], sort) {
  if (String(sort || '') === 'top') return sortCommentsLikeLegacy(comments);
  return sortCommentsByTime(comments);
}

function safeContent(content, {viewerId, commentSort} = {}) {
  const voters = Array.isArray(content.voters) ? content.voters : [];
  const myVote = viewerId
    ? (voters.find(vote => String(vote.userId) === String(viewerId))?.value || 0)
    : 0;
  const upvotes = voters.filter(vote => Number(vote.value) === 1).length;
  const downvotes = voters.filter(vote => Number(vote.value) === -1).length;
  const moderation = content.moderation || {};
  const reportedBy = (moderation.reports || []).map(report => String(report.reporterId));
  return {
    id: String(content._id), communityId: content.communityId, alias: content.alias,
    text: content.text, link: content.link, media: content.media, state: content.state,
    score: content.score, pinned: content.pinned,
    upvotes,
    downvotes,
    commentsCount: countThreadComments(content.comments || []),
    viewerAlias: viewerId ? resolvePostCommentAlias(content, viewerId) : '',
    moderation: {
      status: moderation.status || 'none',
      reportsCount: Number(moderation.reportsCount || 0),
    },
    reportedByMe: Boolean(viewerId && reportedBy.includes(String(viewerId))),
    reactions: safePostReactions(content, viewerId),
    ...safeEngagement(content, viewerId),
    myVote,
    comments: sortCommentsForViewer(content.comments || [], commentSort).map(comment => safeComment(comment, viewerId)),
    createdAt: content.createdAt, publishedAt: content.publishedAt,
  };
}

function normalizeReportInput(body = {}) {
  const reason = String(body.reason || 'other').trim().slice(0, 80) || 'other';
  const context = String(body.context || '').trim().slice(0, 1000);
  return {reason, context};
}

function safeReport(post, report) {
  return {
    id: String(report._id || `${post._id}-${report.createdAt || ''}`),
    contentId: String(post._id),
    postAlias: post.alias,
    postText: post.text,
    reason: report.reason || 'other',
    context: report.context || '',
    status: report.status || 'pending',
    createdAt: report.createdAt,
  };
}

function createCommunityContentRoutes({repository = communityRepository, Content = CommunityContent, storage = {uploadCommunityMedia, deleteCommunityMedia}} = {}) {
  const router = express.Router({mergeParams: true});
  const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: 25 * 1024 * 1024, files: 1}});
  async function context(req, {participate = false, manage = false} = {}) {
    const platformAdmin = req.user?.role === 'admin';
    const community = await repository.findById(req.params.communityId);
    if (!community) throw httpError('Community not found', 404);
    const membership = await repository.getMembership(req.user.id, req.params.communityId);
    if (!platformAdmin && !canViewCommunityContent(community, membership)) throw httpError('Join this community to view its content', 403);
    if (participate && !platformAdmin && !canParticipate(membership)) throw httpError('Active membership required', 403);
    if (manage && !platformAdmin && !canManageCommunity(membership)) throw httpError('Moderator permission required', 403);
    return {community, membership};
  }

  router.get('/feed', auth, async (req, res) => {
    try {
      await context(req);
      const limit = normalizeFeedPageSize(req.query?.limit);
      const before = req.query?.before ? String(req.query.before) : '';
      const query = buildCommunityFeedQuery(req.params.communityId, {before});
      const rows = await Content.find(query)
        .sort(communityFeedSort({before}))
        .limit(limit + 1);
      const {posts, nextCursor, hasMore} = paginateCommunityFeedRows(rows, limit);
      return res.json({
        posts: posts.map(post => safeContent(post, {viewerId: req.user.id})),
        nextCursor,
        hasMore,
      });
    } catch (err) {
      return sendError(res, err);
    }
  });
  router.get('/queue', auth, async (req, res) => {
    try {
      const {community, membership} = await context(req, {participate: true});
      const autoDeleteDays = Math.max(0, Math.min(365, Number(community.queueAutoDeleteDays || 0)));
      if (autoDeleteDays > 0) {
        const cutoff = new Date(Date.now() - autoDeleteDays * 24 * 60 * 60 * 1000);
        await Content.deleteMany({
          communityId: req.params.communityId,
          state: 'queued',
          createdAt: {$lt: cutoff},
        });
      }
      const posts = await Content.find({communityId: req.params.communityId, state: 'queued'})
        .limit(80);
      const ordered = sortQueuePosts(posts).slice(0, 40);
      return res.json({
        posts: ordered.map(post => safeContent(post, {viewerId: req.user.id})),
        canManage: canManageCommunity(membership),
        queueAutoDeleteDays: autoDeleteDays,
      });
    } catch (err) {
      return sendError(res, err);
    }
  });
  router.get('/reports', auth, async (req, res) => {
    try {
      await context(req, {manage: true});
      const posts = await Content.find({communityId: req.params.communityId, 'moderation.status': 'pending'}).sort({updatedAt: -1}).limit(50);
      const reports = posts.flatMap(post => (post.moderation?.reports || [])
        .filter(report => (report.status || 'pending') === 'pending')
        .map(report => safeReport(post, report)));
      return res.json({reports});
    } catch (err) { return sendError(res, err); }
  });
  router.post('/queue', auth, (req, res) => upload.single('media')(req, res, async err => {
    if (err) return sendError(res, httpError('Community media must be 25 MB or smaller', 400));
    let uploaded;
    try {
      await context(req, {participate: true});
      validateCommunityContent({text: req.body?.text, files: req.file ? [req.file] : []});
      uploaded = req.file ? await storage.uploadCommunityMedia(req.file) : null;
      if (req.file) validateUploadedCommunityMedia(uploaded, req.file.mimetype);
      const media = req.file
        ? {
            type: req.file.mimetype.startsWith('video/')
              ? 'video'
              : req.file.mimetype === 'image/gif'
                ? 'sticker'
                : 'image',
            url: uploaded.url,
            publicId: uploaded.publicId,
            mimeType: req.file.mimetype,
          }
        : null;
      const customAlias = normalizeCommentAlias(req.body?.alias || '');
      const post = await Content.create({
        communityId: req.params.communityId,
        authorId: req.user.id,
        alias: customAlias || newAnonymousAlias(),
        text: String(req.body?.text || ''),
        link: '',
        media,
      });
      scheduleCommunityTrendingRecompute(req.params.communityId);
      return res.status(201).json({post: safeContent(post, {viewerId: req.user.id})});
    } catch (error) {
      if (uploaded?.publicId) {
        await storage.deleteCommunityMedia?.(uploaded.publicId, req.file?.mimetype.startsWith('video/'));
      }
      return sendError(res, error);
    }
  }));
  router.post('/queue/publish-top', auth, async (req, res) => {
    try {
      await context(req, {manage: true});
      const posts = await Content.find({communityId: req.params.communityId, state: 'queued'}).limit(80);
      const top = selectEligibleQueuePost(posts);
      if (!top) throw httpError('No posts in the review queue', 404);
      top.state = 'published';
      top.publishedAt = new Date();
      resetQueueVotes(top);
      await top.save();
      scheduleCommunityTrendingRecompute(req.params.communityId);
      return res.json({post: safeContent(top, {viewerId: req.user.id})});
    } catch (err) { return sendError(res, err); }
  });
  router.post('/:contentId/vote', auth, async (req, res) => {
    try {
      await context(req, {participate: true});
      const value = Number(req.body?.value);
      const post = await Content.findOne({_id: req.params.contentId, communityId: req.params.communityId, state: 'queued'}).select('+authorId');
      if (!post) throw httpError('Queued post not found', 404);
      applyQueueVote(post, req.user.id, value);
      await post.save();
      scheduleCommunityTrendingRecompute(req.params.communityId);
      return res.json({post: safeContent(post, {viewerId: req.user.id})});
    } catch (err) { return sendError(res, err); }
  });
  router.post('/:contentId/publish', auth, async (req, res) => {
    try {
      await context(req, {manage: true});
      const post = await Content.findOne({
        _id: req.params.contentId,
        communityId: req.params.communityId,
        state: 'queued',
      });
      if (!post) throw httpError('Queued post not found', 404);
      post.state = 'published';
      post.publishedAt = new Date();
      resetQueueVotes(post);
      await post.save();
      scheduleCommunityTrendingRecompute(req.params.communityId);
      return res.json({post: safeContent(post, {viewerId: req.user.id})});
    } catch (err) {
      return sendError(res, err);
    }
  });
  router.delete('/:contentId', auth, async (req, res) => {
    try {
      await context(req, {manage: true});
      const post = await Content.findOneAndDelete({
        _id: req.params.contentId,
        communityId: req.params.communityId,
        state: 'queued',
      });
      if (!post) throw httpError('Queued post not found', 404);
      if (post.media?.publicId) {
        await storage.deleteCommunityMedia?.(
          post.media.publicId,
          String(post.media.mimeType || '').startsWith('video/'),
        );
      }
      scheduleCommunityTrendingRecompute(req.params.communityId);
      return res.json({deleted: true, id: String(post._id)});
    } catch (err) {
      return sendError(res, err);
    }
  });
  router.get('/:contentId', auth, async (req, res) => {
    try {
      await context(req);
      const post = await Content.findOne({_id: req.params.contentId, communityId: req.params.communityId, state: 'published'});
      if (!post) throw httpError('Post unavailable', 404);
      return res.json({post: safeContent(post, {viewerId: req.user.id, commentSort: req.query?.sort})});
    } catch (err) { return sendError(res, err); }
  });
  router.post('/:contentId/react', auth, async (req, res) => { try { await context(req, {participate: true}); const value = String(req.body?.value || 'like'); const post = await Content.findOne({_id: req.params.contentId, communityId: req.params.communityId, state: 'published'}).select('+authorId'); if (!post) throw httpError('Published post not found', 404); applyPostReaction(post, req.user.id, value); await post.save(); scheduleCommunityTrendingRecompute(req.params.communityId); return res.json({post: safeContent(post, {viewerId: req.user.id})}); } catch (err) { return sendError(res, err); } });
  router.post('/:contentId/like', auth, async (req, res) => { try { await context(req, {participate: true}); const post = await Content.findOne({_id: req.params.contentId, communityId: req.params.communityId, state: 'published'}).select('+authorId'); if (!post) throw httpError('Published post not found', 404); applyPostEngagement(post, req.user.id, 'like'); await post.save(); return res.json({post: safeContent(post, {viewerId: req.user.id})}); } catch (err) { return sendError(res, err); } });
  router.post('/:contentId/dislike', auth, async (req, res) => { try { await context(req, {participate: true}); const post = await Content.findOne({_id: req.params.contentId, communityId: req.params.communityId, state: 'published'}).select('+authorId'); if (!post) throw httpError('Published post not found', 404); applyPostEngagement(post, req.user.id, 'dislike'); await post.save(); return res.json({post: safeContent(post, {viewerId: req.user.id})}); } catch (err) { return sendError(res, err); } });
  router.post('/:contentId/comments', auth, async (req, res) => { try { await context(req, {participate: true}); const text = validateCommentText(req.body?.text); const post = await Content.findOne({_id: req.params.contentId, communityId: req.params.communityId, state: 'published'}).select('+authorId'); if (!post) throw httpError('Published post not found', 404); const alias = resolvePostCommentAlias(post, req.user.id, req.body?.alias); upsertCommentIdentity(post, req.user.id, alias); post.comments.push({authorId: req.user.id, alias, text}); await post.save(); scheduleCommunityTrendingRecompute(req.params.communityId); return res.status(201).json({post: safeContent(post, {viewerId: req.user.id})}); } catch (err) { return sendError(res, err); } });
  router.get('/:contentId/comments', auth, async (req, res) => {
    try {
      await context(req);
      const post = await Content.findOne({_id: req.params.contentId, communityId: req.params.communityId, state: 'published'}).select('+authorId');
      if (!post) throw httpError('Published post not found', 404);
      return res.json({comments: sortCommentsForViewer(post.comments || [], req.query?.sort).map(comment => safeComment(comment, req.user.id))});
    } catch (err) { return sendError(res, err); }
  });
  router.post('/:contentId/comments/:commentId/replies', auth, async (req, res) => { try { await context(req, {participate: true}); const text = validateCommentText(req.body?.text); const post = await Content.findOne({_id: req.params.contentId, communityId: req.params.communityId, state: 'published'}).select('+authorId'); const comment = post?.comments.id(req.params.commentId); if (!comment) throw httpError('Comment not found', 404); const alias = resolvePostCommentAlias(post, req.user.id, req.body?.alias); upsertCommentIdentity(post, req.user.id, alias); comment.replies.push({authorId: req.user.id, alias, text}); await post.save(); scheduleCommunityTrendingRecompute(req.params.communityId); return res.status(201).json({post: safeContent(post, {viewerId: req.user.id}), reply: safeReply(comment.replies[comment.replies.length - 1], req.user.id)}); } catch (err) { return sendError(res, err); } });
  router.get('/:contentId/comments/:commentId/replies', auth, async (req, res) => {
    try {
      await context(req);
      const post = await Content.findOne({_id: req.params.contentId, communityId: req.params.communityId, state: 'published'});
      const comment = post?.comments.id(req.params.commentId);
      if (!comment) throw httpError('Comment not found', 404);
      return res.json({replies: sortRepliesOldestFirst(comment.replies || []).map(reply => safeReply(reply, req.user.id))});
    } catch (err) { return sendError(res, err); }
  });
  async function engageComment(req, res, action) {
    try {
      await context(req, {participate: true});
      const post = await Content.findOne({_id: req.params.contentId, communityId: req.params.communityId, state: 'published'});
      if (!post) throw httpError('Published post not found', 404);
      const comment = post.comments.id(req.params.commentId);
      if (!comment) throw httpError('Comment not found', 404);
      let target = comment;
      if (req.params.replyId) {
        target = comment.replies.id(req.params.replyId);
        if (!target) throw httpError('Reply not found', 404);
      }
      if (action === 'report') {
        applyCommentReport(target, req.user.id, normalizeReportInput(req.body));
      } else {
        applyCommentEngagement(target, req.user.id, action);
      }
      await post.save();
      if (action === 'report') scheduleCommunityTrendingRecompute(req.params.communityId);
      return res.json({
        message: `${action}${req.params.replyId ? ' reply' : ''} updated`,
        post: safeContent(post, {viewerId: req.user.id}),
      });
    } catch (err) { return sendError(res, err); }
  }
  router.post('/:contentId/comments/:commentId/like', auth, (req, res) => engageComment(req, res, 'like'));
  router.post('/:contentId/comments/:commentId/dislike', auth, (req, res) => engageComment(req, res, 'dislike'));
  router.post('/:contentId/comments/:commentId/report', auth, (req, res) => engageComment(req, res, 'report'));
  router.post('/:contentId/comments/:commentId/replies/:replyId/like', auth, (req, res) => engageComment(req, res, 'like'));
  router.post('/:contentId/comments/:commentId/replies/:replyId/dislike', auth, (req, res) => engageComment(req, res, 'dislike'));
  router.post('/:contentId/comments/:commentId/replies/:replyId/report', auth, (req, res) => engageComment(req, res, 'report'));
  router.post('/:contentId/report', auth, async (req, res) => {
    try {
      await context(req, {participate: true});
      const post = await Content.findOne({_id: req.params.contentId, communityId: req.params.communityId});
      if (!post) throw httpError('Post not found', 404);
      const {reason, context: reportContext} = normalizeReportInput(req.body);
      if (!post.moderation) post.moderation = {};
      if (!Array.isArray(post.moderation.reports)) post.moderation.reports = [];
      const alreadyReported = post.moderation.reports.some(report => String(report.reporterId) === String(req.user.id));
      if (!alreadyReported) {
        post.moderation.reports.push({reporterId: String(req.user.id), reason, context: reportContext});
        post.moderation.reportsCount = Number(post.moderation.reportsCount || 0) + 1;
      }
      post.moderation.status = 'pending';
      await post.save();
      scheduleCommunityTrendingRecompute(req.params.communityId);
      return res.json({post: safeContent(post, {viewerId: req.user.id})});
    } catch (err) { return sendError(res, err); }
  });
  router.put('/:contentId/moderation', auth, async (req, res) => { try { await context(req, {manage: true}); const action = String(req.body?.action || ''); const patch = action === 'reject' ? {state: 'rejected', 'moderation.status': 'rejected'} : action === 'remove' ? {state: 'removed', 'moderation.status': 'removed'} : action === 'restore' ? {state: 'published', 'moderation.status': 'approved'} : null; if (!patch) throw httpError('Unsupported moderation action', 400); const post = await Content.findOneAndUpdate({_id: req.params.contentId, communityId: req.params.communityId}, {$set: patch}, {new: true}); if (!post) throw httpError('Post not found', 404); await repository.audit({communityId: req.params.communityId, actorId: req.user.id, action: `content_${action}`, targetType: 'content', targetId: req.params.contentId}); scheduleCommunityTrendingRecompute(req.params.communityId); return res.json({post: safeContent(post, {viewerId: req.user.id})}); } catch (err) { return sendError(res, err); } });
  router.put('/:contentId/pin', auth, async (req, res) => { try { await context(req, {manage: true}); const post = await Content.findOneAndUpdate({_id: req.params.contentId, communityId: req.params.communityId, state: 'published'}, {$set: {pinned: Boolean(req.body?.pinned)}}, {new: true}); if (!post) throw httpError('Published post not found', 404); await repository.audit({communityId: req.params.communityId, actorId: req.user.id, action: req.body?.pinned ? 'content_pinned' : 'content_unpinned', targetType: 'content', targetId: req.params.contentId}); return res.json({post: safeContent(post, {viewerId: req.user.id})}); } catch (err) { return sendError(res, err); } });
  return router;
}

module.exports = createCommunityContentRoutes;
