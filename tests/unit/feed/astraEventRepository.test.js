const assert = require('node:assert/strict');
const test = require('node:test');

const { createAstraEventRepository } = require('../../../src/modules/feed/astra-event.repository');

function createClient() {
  const queries = [];
  return {
    queries,
    client: {
      async execute(query, params, options) {
        queries.push({ query, params, options });
        return { rows: [] };
      },
    },
  };
}

test('post views are append-only Cassandra rows with time buckets', async () => {
  const { client, queries } = createClient();
  const repository = createAstraEventRepository({
    cassandraClient: client,
    now: () => new Date('2026-06-18T12:34:56.000Z'),
    idFactory: () => 'event-1',
  });

  await repository.recordPostView({
    postId: 'post-1',
    userId: 'user-1',
    source: 'home',
    metadata: { position: 4 },
  });

  assert.match(queries[0].query, /INSERT INTO post_view_events/i);
  assert.deepEqual(queries[0].params, [
    'post-1',
    '20260618',
    'event-1',
    'user-1',
    new Date('2026-06-18T12:34:56.000Z'),
    'home',
    JSON.stringify({ position: 4 }),
  ]);
  assert.deepEqual(queries[0].options, { prepare: true });
});

test('watch duration and feed interaction events use Cassandra event tables', async () => {
  const { client, queries } = createClient();
  const repository = createAstraEventRepository({
    cassandraClient: client,
    now: () => new Date('2026-06-18T00:00:00.000Z'),
    idFactory: () => `event-${queries.length + 1}`,
  });

  await repository.recordWatchEvent({
    userId: 'user-1',
    contentId: 'reel-1',
    contentType: 'reel',
    durationMs: 4500,
    completed: false,
  });
  await repository.recordFeedImpression({
    userId: 'user-1',
    feedType: 'home',
    contentId: 'post-1',
    contentType: 'post',
    position: 2,
    rankScore: 9.4,
  });
  await repository.recordFeedClick({
    userId: 'user-1',
    feedType: 'home',
    contentId: 'post-1',
    contentType: 'post',
    position: 2,
  });

  assert.match(queries[0].query, /INSERT INTO watch_events/i);
  assert.match(queries[1].query, /INSERT INTO feed_impression_events/i);
  assert.match(queries[2].query, /INSERT INTO feed_click_events/i);
  assert.equal(queries[0].params[5], 4500);
  assert.equal(queries[1].params[7], 9.4);
  assert.deepEqual(queries[2].params[7], new Date('2026-06-18T00:00:00.000Z'));
});

test('not interested events maintain active hidden post state in Cassandra', async () => {
  const { client, queries } = createClient();
  const repository = createAstraEventRepository({
    cassandraClient: client,
    now: () => new Date('2026-06-18T00:00:00.000Z'),
    idFactory: () => `event-${queries.length + 1}`,
  });

  await repository.markPostNotInterested({
    userId: 'user-1',
    postId: 'post-1',
    source: 'post_menu',
  });
  await repository.undoPostNotInterested({
    userId: 'user-1',
    postId: 'post-1',
    source: 'post_placeholder',
  });

  assert.match(queries[0].query, /INSERT INTO feed_preference_events/i);
  assert.equal(queries[0].params[4], 'not_interested');
  assert.match(queries[1].query, /INSERT INTO user_hidden_posts/i);
  assert.deepEqual(queries[1].params, [
    'user-1',
    'post',
    'post-1',
    new Date('2026-06-18T00:00:00.000Z'),
    'post_menu',
  ]);
  assert.match(queries[2].query, /INSERT INTO feed_preference_events/i);
  assert.equal(queries[2].params[4], 'undo_not_interested');
  assert.match(queries[3].query, /DELETE FROM user_hidden_posts/i);
  assert.deepEqual(queries[3].params, ['user-1', 'post', 'post-1']);
});
