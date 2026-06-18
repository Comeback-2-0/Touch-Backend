const assert = require('node:assert/strict');
const test = require('node:test');

const { createAstraFeedRepository } = require('../../../src/modules/feed/astra-feed.repository');

test('user feed rows are written to Astra feed output collections', async () => {
  const inserts = [];
  const repository = createAstraFeedRepository({
    astraClient: {
      async insertOne(collection, document) {
        inserts.push({ collection, document });
      },
    },
    now: () => new Date('2026-06-18T12:00:00.000Z'),
  });

  await repository.writeUserFeedRow({
    userId: 'user-1',
    rank: 1,
    contentId: 'post-1',
    contentType: 'post',
    reason: 'recent',
    score: 9.5,
  });

  assert.equal(inserts[0].collection, 'user_feeds');
  assert.deepEqual(inserts[0].document, {
    userId: 'user-1',
    bucket: '20260618',
    rank: 1,
    contentId: 'post-1',
    contentType: 'post',
    reason: 'recent',
    score: 9.5,
    createdAt: '2026-06-18T12:00:00.000Z',
  });
});

test('feed repository reads Astra feed rows by bucket and rank', async () => {
  const commands = [];
  const repository = createAstraFeedRepository({
    astraClient: {
      async command(collection, body) {
        commands.push({ collection, body });
        return { data: { documents: [] } };
      },
    },
  });

  await repository.getUserFeed({ userId: 'user-1', bucket: '20260618', limit: 20 });

  assert.equal(commands[0].collection, 'user_feeds');
  assert.deepEqual(commands[0].body.find.filter, {
    userId: 'user-1',
    bucket: '20260618',
  });
  assert.deepEqual(commands[0].body.find.sort, { rank: 1 });
});
