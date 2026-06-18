const assert = require('node:assert/strict');
const test = require('node:test');

const { createReelWatchHandlers } = require('../../../src/modules/reels/reel.controller');

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

test('reel watch events are written to Astra and Mongo keeps aggregate counters only', async () => {
  const calls = [];
  const handlers = createReelWatchHandlers({
    reelModel: {
      async findByIdAndUpdate(reelId, update) {
        calls.push(`counter:${reelId}:${update.$inc.totalViews}:${update.$inc.totalWatchTime}`);
      },
    },
    eventRepository: {
      async recordWatchEvent(input) {
        calls.push(`event:${input.userId}:${input.contentId}:${input.contentType}:${input.durationMs}`);
      },
    },
  });

  const res = createResponse();
  await handlers.recordWatchTime({
    user: { id: 'user-1' },
    body: { reelId: 'reel-1', mood: 'happy', duration: 4500 },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [
    'event:user-1:reel-1:reel:4500',
    'counter:reel-1:1:4500',
  ]);
});
