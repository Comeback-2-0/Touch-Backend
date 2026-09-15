const { getCassandraClient } = require('../../database/cassandraClient');
const { timeBucket } = require('./astra-event.repository');

function createAstraFeedRepository({
  cassandraClient = getCassandraClient(),
  now = () => new Date(),
} = {}) {
  function feedRow(input) {
    const date = now();
    return {
      bucket: timeBucket(date),
      rank: Number(input.rank || 0),
      contentId: String(input.contentId),
      contentType: String(input.contentType),
      score: Number(input.score || 0),
      createdAt: date,
    };
  }

  function execute(query, params) {
    return cassandraClient.execute(query, params, { prepare: true });
  }

  function mapUserFeedRow(row) {
    return {
      userId: row.user_id,
      bucket: row.bucket,
      rank: row.rank,
      contentId: row.content_id,
      contentType: row.content_type,
      reason: row.reason,
      score: row.score,
      createdAt: row.created_at,
    };
  }

  return {
    writeUserFeedRow(input) {
      const row = feedRow(input);
      return execute(
        `INSERT INTO user_feeds
        (user_id, bucket, rank, content_id, content_type, reason, score, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(input.userId),
          row.bucket,
          row.rank,
          row.contentId,
          row.contentType,
          input.reason || '',
          row.score,
          row.createdAt,
        ],
      );
    },

    writeCommunityFeedRow(input) {
      const row = feedRow(input);
      return execute(
        `INSERT INTO community_feeds
        (community_id, bucket, rank, content_id, content_type, score, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          String(input.communityId),
          row.bucket,
          row.rank,
          row.contentId,
          row.contentType,
          row.score,
          row.createdAt,
        ],
      );
    },

    writeTrendingFeedRow(input) {
      const row = feedRow(input);
      return execute(
        `INSERT INTO trending_feeds
        (feed_key, bucket, rank, content_id, content_type, score, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          String(input.feedKey || 'global'),
          row.bucket,
          row.rank,
          row.contentId,
          row.contentType,
          row.score,
          row.createdAt,
        ],
      );
    },

    async getUserFeed({ userId, bucket, limit = 20 }) {
      const safeLimit = Math.min(Number(limit) || 20, 100);
      const result = await execute(
        `SELECT user_id, bucket, rank, content_id, content_type, reason, score, created_at
        FROM user_feeds
        WHERE user_id = ? AND bucket = ?
        ORDER BY rank ASC
        LIMIT ?`,
        [String(userId), bucket, safeLimit],
      );
      return (result.rows || []).map(mapUserFeedRow);
    },
  };
}

module.exports = {
  createAstraFeedRepository,
};
