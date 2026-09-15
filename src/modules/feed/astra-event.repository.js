const { v4: uuidv4 } = require('uuid');
const { getCassandraClient } = require('../../database/cassandraClient');

function timeBucket(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function stringifyMetadata(metadata) {
  return JSON.stringify(metadata || {});
}

function createAstraEventRepository({
  cassandraClient = getCassandraClient(),
  now = () => new Date(),
  idFactory = uuidv4,
} = {}) {
  function baseEvent() {
    const date = now();
    return {
      eventId: String(idFactory()),
      bucket: timeBucket(date),
      date,
    };
  }

  function execute(query, params) {
    return cassandraClient.execute(query, params, { prepare: true });
  }

  return {
    async recordPostView({ postId, userId, source = '', metadata = {} }) {
      const event = baseEvent();
      await execute(
        `INSERT INTO post_view_events
        (post_id, bucket, event_id, user_id, viewed_at, source, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          String(postId),
          event.bucket,
          event.eventId,
          String(userId),
          event.date,
          source,
          stringifyMetadata(metadata),
        ],
      );
      return { eventId: event.eventId, bucket: event.bucket };
    },

    async recordReelView({ reelId, userId, source = '', metadata = {} }) {
      const event = baseEvent();
      await execute(
        `INSERT INTO reel_view_events
        (reel_id, bucket, event_id, user_id, viewed_at, source, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          String(reelId),
          event.bucket,
          event.eventId,
          String(userId),
          event.date,
          source,
          stringifyMetadata(metadata),
        ],
      );
      return { eventId: event.eventId, bucket: event.bucket };
    },

    async recordWatchEvent({ userId, contentId, contentType, durationMs, completed = false }) {
      const event = baseEvent();
      await execute(
        `INSERT INTO watch_events
        (user_id, bucket, event_id, content_id, content_type, duration_ms, completed, watched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(userId),
          event.bucket,
          event.eventId,
          String(contentId),
          String(contentType),
          Number(durationMs || 0),
          Boolean(completed),
          event.date,
        ],
      );
      return { eventId: event.eventId, bucket: event.bucket };
    },

    async recordFeedImpression({ userId, feedType, contentId, contentType, position, rankScore = 0 }) {
      const event = baseEvent();
      await execute(
        `INSERT INTO feed_impression_events
        (user_id, bucket, event_id, feed_type, content_id, content_type, position, rank_score, impressed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(userId),
          event.bucket,
          event.eventId,
          String(feedType),
          String(contentId),
          String(contentType),
          Number(position || 0),
          Number(rankScore || 0),
          event.date,
        ],
      );
      return { eventId: event.eventId, bucket: event.bucket };
    },

    async recordFeedClick({ userId, feedType, contentId, contentType, position }) {
      const event = baseEvent();
      await execute(
        `INSERT INTO feed_click_events
        (user_id, bucket, event_id, feed_type, content_id, content_type, position, clicked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(userId),
          event.bucket,
          event.eventId,
          String(feedType),
          String(contentId),
          String(contentType),
          Number(position || 0),
          event.date,
        ],
      );
      return { eventId: event.eventId, bucket: event.bucket };
    },

    async recordRankingEvent({ userId, feedType, algorithm, contentId, score, features = {} }) {
      const event = baseEvent();
      await execute(
        `INSERT INTO ranking_events
        (user_id, bucket, event_id, feed_type, algorithm, content_id, score, features, generated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(userId),
          event.bucket,
          event.eventId,
          String(feedType),
          String(algorithm),
          String(contentId),
          Number(score || 0),
          stringifyMetadata(features),
          event.date,
        ],
      );
      return { eventId: event.eventId, bucket: event.bucket };
    },

    async markPostNotInterested({ userId, postId, source = '', metadata = {} }) {
      const event = baseEvent();
      await execute(
        `INSERT INTO feed_preference_events
        (user_id, bucket, event_id, content_type, event_type, content_id, source, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(userId),
          event.bucket,
          event.eventId,
          'post',
          'not_interested',
          String(postId),
          source,
          stringifyMetadata(metadata),
          event.date,
        ],
      );
      await execute(
        `INSERT INTO user_hidden_posts
        (user_id, content_type, content_id, hidden_at, source)
        VALUES (?, ?, ?, ?, ?)`,
        [String(userId), 'post', String(postId), event.date, source],
      );

      return { hidden: true, event: { eventId: event.eventId, bucket: event.bucket } };
    },

    async undoPostNotInterested({ userId, postId, source = '', metadata = {} }) {
      const event = baseEvent();
      await execute(
        `INSERT INTO feed_preference_events
        (user_id, bucket, event_id, content_type, event_type, content_id, source, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(userId),
          event.bucket,
          event.eventId,
          'post',
          'undo_not_interested',
          String(postId),
          source,
          stringifyMetadata(metadata),
          event.date,
        ],
      );
      await execute(
        'DELETE FROM user_hidden_posts WHERE user_id = ? AND content_type = ? AND content_id = ?',
        [String(userId), 'post', String(postId)],
      );

      return { hidden: false, event: { eventId: event.eventId, bucket: event.bucket } };
    },
  };
}

module.exports = {
  createAstraEventRepository,
  timeBucket,
};
