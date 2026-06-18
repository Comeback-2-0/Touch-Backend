const { createAstraEventRepository } = require('./astra-event.repository');
const defaultContentRepository = require('./content-existence.repository');

function createFeedEventController({
  eventRepository = createAstraEventRepository(),
  contentRepository = defaultContentRepository,
} = {}) {
  function authUserId(req) {
    return req.user?.id;
  }

  async function requireContent(res, { contentId, contentType }) {
    if (!contentId || !contentType) {
      res.status(400).json({ error: 'contentId and contentType are required' });
      return false;
    }

    const found = await contentRepository.exists({ contentId, contentType });
    if (!found) {
      res.status(404).json({ error: 'Content not found' });
      return false;
    }

    return true;
  }

  async function recordPostView(req, res) {
    const userId = authUserId(req);
    const { postId, source = '', metadata = {} } = req.body || {};
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    if (!await requireContent(res, { contentId: postId, contentType: 'post' })) return undefined;

    const event = await eventRepository.recordPostView({
      userId,
      postId,
      source,
      metadata,
    });
    return res.status(201).json({ event });
  }

  async function recordReelView(req, res) {
    const userId = authUserId(req);
    const { reelId, source = '', metadata = {} } = req.body || {};
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    if (!await requireContent(res, { contentId: reelId, contentType: 'reel' })) return undefined;

    const event = await eventRepository.recordReelView({
      userId,
      reelId,
      source,
      metadata,
    });
    return res.status(201).json({ event });
  }

  async function recordWatchEvent(req, res) {
    const userId = authUserId(req);
    const {
      contentId,
      contentType,
      durationMs,
      completed = false,
    } = req.body || {};
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    if (!await requireContent(res, { contentId, contentType })) return undefined;

    const event = await eventRepository.recordWatchEvent({
      userId,
      contentId,
      contentType,
      durationMs,
      completed,
    });
    return res.status(201).json({ event });
  }

  async function recordFeedImpression(req, res) {
    const userId = authUserId(req);
    const {
      feedType,
      contentId,
      contentType,
      position,
      rankScore,
    } = req.body || {};
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    if (!await requireContent(res, { contentId, contentType })) return undefined;

    const event = await eventRepository.recordFeedImpression({
      userId,
      feedType,
      contentId,
      contentType,
      position,
      rankScore,
    });
    return res.status(201).json({ event });
  }

  async function recordFeedClick(req, res) {
    const userId = authUserId(req);
    const {
      feedType,
      contentId,
      contentType,
      position,
    } = req.body || {};
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    if (!await requireContent(res, { contentId, contentType })) return undefined;

    const event = await eventRepository.recordFeedClick({
      userId,
      feedType,
      contentId,
      contentType,
      position,
    });
    return res.status(201).json({ event });
  }

  async function recordRankingEvent(req, res) {
    const userId = authUserId(req);
    const {
      feedType,
      algorithm,
      contentId,
      score,
      features = {},
    } = req.body || {};
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const event = await eventRepository.recordRankingEvent({
      userId,
      feedType,
      algorithm,
      contentId,
      score,
      features,
    });
    return res.status(201).json({ event });
  }

  return {
    recordPostView,
    recordReelView,
    recordWatchEvent,
    recordFeedImpression,
    recordFeedClick,
    recordRankingEvent,
  };
}

module.exports = {
  createFeedEventController,
};
