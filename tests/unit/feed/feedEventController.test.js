const assert = require('node:assert/strict');
const test = require('node:test');

const { createFeedEventController } = require('../../../src/modules/feed/feed-event.controller');

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

test('post view event validates content and writes to Astra', async () => {
  const calls = [];
  const controller = createFeedEventController({
    eventRepository: {
      async recordPostView(input) {
        calls.push(input);
        return { eventId: 'event-1' };
      },
    },
    contentRepository: {
      async exists({ contentId, contentType }) {
        return contentId === 'post-1' && contentType === 'post';
      },
    },
  });

  const res = createResponse();
  await controller.recordPostView({
    user: { id: 'user-1' },
    body: { postId: 'post-1', source: 'home', metadata: { position: 1 } },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(calls[0], {
    userId: 'user-1',
    postId: 'post-1',
    source: 'home',
    metadata: { position: 1 },
  });
});

test('feed click event rejects missing content', async () => {
  const controller = createFeedEventController({
    eventRepository: {
      async recordFeedClick() {
        throw new Error('should not write');
      },
    },
    contentRepository: {
      async exists() {
        return false;
      },
    },
  });

  const res = createResponse();
  await controller.recordFeedClick({
    user: { id: 'user-1' },
    body: {
      feedType: 'home',
      contentId: 'post-missing',
      contentType: 'post',
      position: 4,
    },
  }, res);

  assert.equal(res.statusCode, 404);
  assert.match(res.body.error, /content not found/i);
});
