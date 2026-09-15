const assert = require('node:assert/strict');
const test = require('node:test');

const { createAstraFeedRepository } = require('../../../src/modules/feed/astra-feed.repository');

test('user feed rows are written to Cassandra feed output tables', async () => {
  const queries = [];
  const repository = createAstraFeedRepository({
    cassandraClient: {
      async execute(query, params, options) {
        queries.push({ query, params, options });
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

  assert.match(queries[0].query, /INSERT INTO user_feeds/i);
  assert.deepEqual(queries[0].params, [
    'user-1',
    '20260618',
    1,
    'post-1',
    'post',
    'recent',
    9.5,
    new Date('2026-06-18T12:00:00.000Z'),
  ]);
  assert.deepEqual(queries[0].options, { prepare: true });
});

test('feed repository reads Cassandra feed rows by user bucket and rank', async () => {
  const queries = [];
  const repository = createAstraFeedRepository({
    cassandraClient: {
      async execute(query, params, options) {
        queries.push({ query, params, options });
        return {
          rows: [
            {
              user_id: 'user-1',
              bucket: '20260618',
              rank: 1,
              content_id: 'post-1',
              content_type: 'post',
              reason: 'recent',
              score: 9.5,
              created_at: new Date('2026-06-18T12:00:00.000Z'),
            },
          ],
        };
      },
    },
  });

  const rows = await repository.getUserFeed({ userId: 'user-1', bucket: '20260618', limit: 20 });

  assert.match(queries[0].query, /SELECT[\s\S]*FROM user_feeds/i);
  assert.match(queries[0].query, /ORDER BY rank ASC/i);
  assert.deepEqual(queries[0].params, ['user-1', '20260618', 20]);
  assert.deepEqual(queries[0].options, { prepare: true });
  assert.deepEqual(rows, [
    {
      userId: 'user-1',
      bucket: '20260618',
      rank: 1,
      contentId: 'post-1',
      contentType: 'post',
      reason: 'recent',
      score: 9.5,
      createdAt: new Date('2026-06-18T12:00:00.000Z'),
    },
  ]);
});
