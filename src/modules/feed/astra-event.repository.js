const { v4: uuidv4 } = require('uuid');
const { createAstraClient } = require('../../database/astraClient');

function timeBucket(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function createAstraEventRepository({
  astraClient = createAstraClient(),
  now = () => new Date(),
  idFactory = uuidv4,
} = {}) {
  function baseEvent() {
    const date = now();
    return {
      eventId: idFactory(),
      bucket: timeBucket(date),
      date,
    };
  }

  async function insert(collection, document) {
    await astraClient.insertOne(collection, document);
    return document;
  }

  return {
    recordPostView({ postId, userId, source = '', metadata = {} }) {
      const event = baseEvent();
      return insert('post_view_events', {
        eventId: event.eventId,
        postId: String(postId),
        userId: String(userId),
        source,
        metadata,
        bucket: event.bucket,
        viewedAt: event.date.toISOString(),
      });
    },
    recordReelView({ reelId, userId, source = '', metadata = {} }) {
      const event = baseEvent();
      return insert('reel_view_events', {
        eventId: event.eventId,
        reelId: String(reelId),
        userId: String(userId),
        source,
        metadata,
        bucket: event.bucket,
        viewedAt: event.date.toISOString(),
      });
    },
    recordWatchEvent({ userId, contentId, contentType, durationMs, completed = false }) {
      const event = baseEvent();
      return insert('watch_events', {
        eventId: event.eventId,
        userId: String(userId),
        contentId: String(contentId),
        contentType: String(contentType),
        durationMs: Number(durationMs || 0),
        completed: Boolean(completed),
        bucket: event.bucket,
        watchedAt: event.date.toISOString(),
      });
    },
    recordFeedImpression({ userId, feedType, contentId, contentType, position, rankScore = 0 }) {
      const event = baseEvent();
      return insert('feed_impression_events', {
        eventId: event.eventId,
        userId: String(userId),
        feedType: String(feedType),
        contentId: String(contentId),
        contentType: String(contentType),
        position: Number(position || 0),
        rankScore: Number(rankScore || 0),
        bucket: event.bucket,
        impressedAt: event.date.toISOString(),
      });
    },
    recordFeedClick({ userId, feedType, contentId, contentType, position }) {
      const event = baseEvent();
      return insert('feed_click_events', {
        eventId: event.eventId,
        userId: String(userId),
        feedType: String(feedType),
        contentId: String(contentId),
        contentType: String(contentType),
        position: Number(position || 0),
        bucket: event.bucket,
        clickedAt: event.date.toISOString(),
      });
    },
    recordRankingEvent({ userId, feedType, algorithm, contentId, score, features = {} }) {
      const event = baseEvent();
      return insert('ranking_events', {
        eventId: event.eventId,
        userId: String(userId),
        feedType: String(feedType),
        algorithm: String(algorithm),
        contentId: String(contentId),
        score: Number(score || 0),
        features,
        bucket: event.bucket,
        generatedAt: event.date.toISOString(),
      });
    },
  };
}

module.exports = {
  createAstraEventRepository,
  timeBucket,
};
