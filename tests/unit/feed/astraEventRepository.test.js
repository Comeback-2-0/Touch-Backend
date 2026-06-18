const assert = require('node:assert/strict');
const test = require('node:test');

const { createAstraEventRepository } = require('../../../src/modules/feed/astra-event.repository');

function createClient() {
  const inserts = [];
  return {
    inserts,
    client: {
      async insertOne(collection, document) {
        inserts.push({ collection, document });
        return { ok: true };
      },
    },
  };
}

test('post views are append-only Astra event documents with time buckets', async () => {
  const { client, inserts } = createClient();
  const repository = createAstraEventRepository({
    astraClient: client,
    now: () => new Date('2026-06-18T12:34:56.000Z'),
    idFactory: () => 'event-1',
  });

  await repository.recordPostView({
    postId: 'post-1',
    userId: 'user-1',
    source: 'home',
    metadata: { position: 4 },
  });

  assert.equal(inserts[0].collection, 'post_view_events');
  assert.deepEqual(inserts[0].document, {
    eventId: 'event-1',
    postId: 'post-1',
    userId: 'user-1',
    source: 'home',
    metadata: { position: 4 },
    bucket: '20260618',
    viewedAt: '2026-06-18T12:34:56.000Z',
  });
});

test('watch duration and feed interaction events use Astra-owned collections', async () => {
  const { client, inserts } = createClient();
  const repository = createAstraEventRepository({
    astraClient: client,
    now: () => new Date('2026-06-18T00:00:00.000Z'),
    idFactory: () => `event-${inserts.length + 1}`,
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

  assert.deepEqual(inserts.map(insert => insert.collection), [
    'watch_events',
    'feed_impression_events',
    'feed_click_events',
  ]);
  assert.equal(inserts[0].document.durationMs, 4500);
  assert.equal(inserts[1].document.rankScore, 9.4);
  assert.equal(inserts[2].document.clickedAt, '2026-06-18T00:00:00.000Z');
});
