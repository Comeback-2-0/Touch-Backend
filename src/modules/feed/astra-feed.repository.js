const { createAstraClient } = require('../../database/astraClient');
const { timeBucket } = require('./astra-event.repository');

function createAstraFeedRepository({
  astraClient = createAstraClient(),
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
      createdAt: date.toISOString(),
    };
  }

  return {
    writeUserFeedRow(input) {
      return astraClient.insertOne('user_feeds', {
        userId: String(input.userId),
        ...feedRow(input),
        reason: input.reason || '',
      });
    },
    writeCommunityFeedRow(input) {
      return astraClient.insertOne('community_feeds', {
        communityId: String(input.communityId),
        ...feedRow(input),
      });
    },
    writeTrendingFeedRow(input) {
      return astraClient.insertOne('trending_feeds', {
        feedKey: String(input.feedKey || 'global'),
        ...feedRow(input),
      });
    },
    async getUserFeed({ userId, bucket, limit = 20 }) {
      const result = await astraClient.command('user_feeds', {
        find: {
          filter: {
            userId: String(userId),
            bucket,
          },
          sort: { rank: 1 },
          limit: Math.min(Number(limit) || 20, 100),
        },
      });
      return result?.data?.documents || [];
    },
  };
}

module.exports = {
  createAstraFeedRepository,
};
