const assert = require('node:assert/strict');
const test = require('node:test');

const { createReelEngagementHandlers } = require('../../../src/modules/reels/reel.controller');

function createResponse() {
  return {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('reel likes use Neo4j relationships and Mongo counters', async () => {
  const calls = [];
  const handlers = createReelEngagementHandlers({
    reelModel: {
      async findByIdAndUpdate(reelId, update) {
        calls.push(`counter:${reelId}:${update.$inc.likes}`);
      },
    },
    engagementRepository: {
      async hasLiked(input) {
        calls.push(`hasLiked:${input.userId}:${input.contentId}:${input.contentType}`);
        return false;
      },
      async likeContent(input) {
        calls.push(`like:${input.userId}:${input.contentId}:${input.contentType}`);
      },
    },
  });

  const res = createResponse();
  await handlers.likeReel({ user: { id: 'user-1' }, body: { reelId: 'reel-1' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.liked, true);
  assert.deepEqual(calls, [
    'hasLiked:user-1:reel-1:reel',
    'like:user-1:reel-1:reel',
    'counter:reel-1:1',
  ]);
});

test('reel saves use Neo4j relationships and Mongo counters', async () => {
  const calls = [];
  const handlers = createReelEngagementHandlers({
    reelModel: {
      async findByIdAndUpdate(reelId, update) {
        calls.push(`counter:${reelId}:${update.$inc.saves}`);
      },
    },
    engagementRepository: {
      async hasSaved(input) {
        calls.push(`hasSaved:${input.userId}:${input.contentId}:${input.contentType}`);
        return true;
      },
      async unsaveContent(input) {
        calls.push(`unsave:${input.userId}:${input.contentId}:${input.contentType}`);
      },
    },
  });

  const res = createResponse();
  await handlers.saveReel({ user: { id: 'user-1' }, body: { reelId: 'reel-1' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.saved, false);
  assert.deepEqual(calls, [
    'hasSaved:user-1:reel-1:reel',
    'unsave:user-1:reel-1:reel',
    'counter:reel-1:-1',
  ]);
});
