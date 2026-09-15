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
  sortCommentsLikeLegacy,
  sortRepliesOldestFirst,
} = require('./community-content.service');
const {uploadCommunityMedia, deleteCommunityMedia} = require('../../storage/cloudinary');
const {selectEligibleQueuePost} = require('./community-publication.service');

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

function safeReply(reply, viewerId) {
  return {
    id: String(reply._id),
    alias: reply.alias,
    text: reply.text,
    createdAt: reply.createdAt,
    ...safeEngagement(reply, viewerId),
  };
}

function safeComment(comment, viewerId) {
  return {
    id: String(comment._id),
    alias: comment.alias,
    text: comment.text,
    createdAt: comment.createdAt,
    ...safeEngagement(comment, viewerId),
    replies: sortRepliesOldestFirst(comment.replies || []).map(reply => safeReply(reply, viewerId)),
  };
}

function safeContent(content, {viewerId} = {}) {
  const voters = Array.isArray(content.voters) ? content.voters : [];
  const myVote = viewerId
    ? (voters.find(vote => String(vote.userId) === String(viewerId))?.value || 0)
    : 0;
  return {
    id: String(content._id), communityId: content.communityId, alias: content.alias,
    text: content.text, link: content.link, media: content.media, state: content.state,
    score: content.score, pinned: content.pinned, moderation: content.moderation,
    myVote,
    comments: sortCommentsLikeLegacy(content.comments || []).map(comment => safeComment(comment, viewerId)),
    createdAt: content.createdAt, publishedAt: content.publishedAt,
  };
}

function createCommunityContentRoutes({repository = communityRepository, Content = CommunityContent, storage = {uploadCommunityMedia, deleteCommunityMedia}} = {}) {
  const router = express.Router({mergeParams: true});
  const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: 25 * 1024 * 1024, files: 1}});
  async function context(req, {participate = false, manage = false} = {}) {
    const community = await repository.findById(req.params.communityId);
    if (!community) throw httpError('Community not found', 404);
    const membership = await repository.getMembership(req.user.id, req.params.communityId);
    if (!canViewCommunityContent(community, membership)) throw httpError('Join this community to view its content', 403);
    if (participate && !canParticipate(membership)) throw httpError('Active membership required', 403);
    if (manage && !canManageCommunity(membership)) throw httpError('Moderator permission required', 403);
    return {community, membership};
  }

  router.get('/feed', auth, async (req, res) => { try { await context(req); const posts = await Content.find({communityId: req.params.communityId, state: 'published'}).sort({pinned: -1, publishedAt: -1, createdAt: -1}).limit(30); return res.json({posts: posts.map(post => safeContent(post, {viewerId: req.user.id}))}); } catch (err) { return sendError(res, err); } });
  router.get('/queue', auth, async (req, res) => { try { const {membership} = await context(req, {participate: true}); const posts = await Content.find({communityId: req.params.communityId, state: 'queued'}).sort({score: -1, createdAt: 1}).limit(30); return res.json({posts: posts.map(post => safeContent(post, {viewerId: req.user.id})), canManage: canManageCommunity(membership)}); } catch (err) { return sendError(res, err); } });
  router.post('/queue', auth, (req, res) => upload.single('media')(req, res, async err => { if (err) return sendError(res, httpError('Community media must be 25 MB or smaller', 400)); let uploaded; try { await context(req, {participate: true}); validateCommunityContent({text: req.body?.text, files: req.file ? [req.file] : []}); uploaded = req.file ? await storage.uploadCommunityMedia(req.file) : null; if (req.file) validateUploadedCommunityMedia(uploaded, req.file.mimetype); const media = req.file ? {type: req.file.mimetype.startsWith('video/') ? 'video' : req.file.mimetype === 'image/gif' ? 'sticker' : 'image', url: uploaded.url, publicId: uploaded.publicId, mimeType: req.file.mimetype} : null; const post = await Content.create({communityId: req.params.communityId, authorId: req.user.id, alias: newAnonymousAlias(), text: String(req.body?.text || ''), link: String(req.body?.link || ''), media}); return res.status(201).json({post: safeContent(post, {viewerId: req.user.id})}); } catch (error) { if (uploaded?.publicId) await storage.deleteCommunityMedia?.(uploaded.publicId, req.file?.mimetype.startsWith('video/')); return sendError(res, error); } }));
  router.post('/queue/publish-top', auth, async (req, res) => {
    try {
      await context(req, {manage: true});
      const posts = await Content.find({communityId: req.params.communityId, state: 'queued'}).sort({score: -1, createdAt: 1}).limit(20);
      const top = selectEligibleQueuePost(posts);
      if (!top) throw httpError('No posts in the review queue', 404);
      top.state = 'published';
      top.publishedAt = new Date();
      await top.save();
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
      return res.json({post: safeContent(post, {viewerId: req.user.id})});
    } catch (err) { return sendError(res, err); }
  });
  router.post('/:contentId/publish', auth, async (req, res) => { try { await context(req, {manage: true}); const post = await Content.findOneAndUpdate({_id: req.params.contentId, communityId: req.params.communityId, state: 'queued'}, {$set: {state: 'published', publishedAt: new Date()}}, {new: true}); if (!post) throw httpError('Queued post not found', 404); return res.json({post: safeContent(post, {viewerId: req.user.id})}); } catch (err) { return sendError(res, err); } });
  router.post('/:contentId/react', auth, async (req, res) => { try { await context(req, {participate: true}); const value = String(req.body?.value || 'like'); if (!['like', 'love', 'laugh', 'support'].includes(value)) throw httpError('Unsupported reaction', 400); const post = await Content.findOne({_id: req.params.contentId, communityId: req.params.communityId, state: 'published'}).select('+authorId'); if (!post) throw httpError('Published post not found', 404); const previous = post.reactions.find(reaction => String(reaction.userId) === String(req.user.id)); if (previous) previous.value = value; else post.reactions.push({userId: req.user.id, value}); await post.save(); return res.json({post: safeContent(post, {viewerId: req.user.id})}); } catch (err) { return sendError(res, err); } });
  router.post('/:contentId/comments', auth, async (req, res) => { try { await context(req, {participate: true}); const text = String(req.body?.text || '').trim(); if (!text) throw httpError('Comment text is required', 400); const post = await Content.findOne({_id: req.params.contentId, communityId: req.params.communityId, state: 'published'}); if (!post) throw httpError('Published post not found', 404); post.comments.push({authorId: req.user.id, alias: newAnonymousAlias(), text}); await post.save(); return res.status(201).json({post: safeContent(post, {viewerId: req.user.id})}); } catch (err) { return sendError(res, err); } });
  router.get('/:contentId/comments', auth, async (req, res) => {
    try {
      await context(req);
      const post = await Content.findOne({_id: req.params.contentId, communityId: req.params.communityId, state: 'published'});
      if (!post) throw httpError('Published post not found', 404);
      return res.json({comments: sortCommentsLikeLegacy(post.comments || []).map(comment => safeComment(comment, req.user.id))});
    } catch (err) { return sendError(res, err); }
  });
  router.post('/:contentId/comments/:commentId/replies', auth, async (req, res) => { try { await context(req, {participate: true}); const text = String(req.body?.text || '').trim(); if (!text) throw httpError('Reply text is required', 400); const post = await Content.findOne({_id: req.params.contentId, communityId: req.params.communityId, state: 'published'}); const comment = post?.comments.id(req.params.commentId); if (!comment) throw httpError('Comment not found', 404); comment.replies.push({authorId: req.user.id, alias: newAnonymousAlias(), text}); await post.save(); return res.status(201).json({post: safeContent(post, {viewerId: req.user.id}), reply: safeReply(comment.replies[comment.replies.length - 1], req.user.id)}); } catch (err) { return sendError(res, err); } });
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
      applyCommentEngagement(target, req.user.id, action);
      await post.save();
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
  router.post('/:contentId/report', auth, async (req, res) => { try { await context(req, {participate: true}); const post = await Content.findOneAndUpdate({_id: req.params.contentId, communityId: req.params.communityId}, {$inc: {'moderation.reportsCount': 1}, $set: {'moderation.status': 'pending'}}, {new: true}); if (!post) throw httpError('Post not found', 404); return res.json({post: safeContent(post, {viewerId: req.user.id})}); } catch (err) { return sendError(res, err); } });
  router.put('/:contentId/moderation', auth, async (req, res) => { try { await context(req, {manage: true}); const action = String(req.body?.action || ''); const patch = action === 'reject' ? {state: 'rejected', 'moderation.status': 'rejected'} : action === 'remove' ? {state: 'removed', 'moderation.status': 'removed'} : action === 'restore' ? {state: 'published', 'moderation.status': 'approved'} : null; if (!patch) throw httpError('Unsupported moderation action', 400); const post = await Content.findOneAndUpdate({_id: req.params.contentId, communityId: req.params.communityId}, {$set: patch}, {new: true}); if (!post) throw httpError('Post not found', 404); await repository.audit({communityId: req.params.communityId, actorId: req.user.id, action: `content_${action}`, targetType: 'content', targetId: req.params.contentId}); return res.json({post: safeContent(post, {viewerId: req.user.id})}); } catch (err) { return sendError(res, err); } });
  router.put('/:contentId/pin', auth, async (req, res) => { try { await context(req, {manage: true}); const post = await Content.findOneAndUpdate({_id: req.params.contentId, communityId: req.params.communityId, state: 'published'}, {$set: {pinned: Boolean(req.body?.pinned)}}, {new: true}); if (!post) throw httpError('Published post not found', 404); await repository.audit({communityId: req.params.communityId, actorId: req.user.id, action: req.body?.pinned ? 'content_pinned' : 'content_unpinned', targetType: 'content', targetId: req.params.contentId}); return res.json({post: safeContent(post, {viewerId: req.user.id})}); } catch (err) { return sendError(res, err); } });
  return router;
}

module.exports = createCommunityContentRoutes;
