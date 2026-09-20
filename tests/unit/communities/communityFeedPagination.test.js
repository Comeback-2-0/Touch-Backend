const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeFeedPageSize,
  buildCommunityFeedQuery,
  communityFeedSort,
  paginateCommunityFeedRows,
  MAX_FEED_PAGE_SIZE,
} = require('../../../src/modules/communities/community-content.service');

test('feed page size is capped', () => {
  assert.equal(normalizeFeedPageSize(undefined), 20);
  assert.equal(normalizeFeedPageSize(3), 3);
  assert.equal(normalizeFeedPageSize(999), MAX_FEED_PAGE_SIZE);
  assert.equal(normalizeFeedPageSize(-4), 1);
});

test('before cursor filters publishedAt exclusively', () => {
  const query = buildCommunityFeedQuery('c1', {before: '2026-09-16T12:00:00.000Z'});
  assert.equal(query.communityId, 'c1');
  assert.equal(query.state, 'published');
  assert.deepEqual(query.publishedAt, {$lt: new Date('2026-09-16T12:00:00.000Z')});
  assert.deepEqual(communityFeedSort({before: '2026-09-16T12:00:00.000Z'}), {
    publishedAt: -1,
    createdAt: -1,
    _id: -1,
  });
});

test('first page keeps pinned-first sort', () => {
  assert.deepEqual(communityFeedSort({}), {
    pinned: -1,
    publishedAt: -1,
    createdAt: -1,
    _id: -1,
  });
});

test('paginateCommunityFeedRows exposes nextCursor only when more exist', () => {
  const rows = [
    {publishedAt: '2026-09-16T10:00:00.000Z'},
    {publishedAt: '2026-09-15T10:00:00.000Z'},
    {publishedAt: '2026-09-14T10:00:00.000Z'},
  ];
  const page = paginateCommunityFeedRows(rows, 2);
  assert.equal(page.posts.length, 2);
  assert.equal(page.hasMore, true);
  assert.equal(page.nextCursor, '2026-09-15T10:00:00.000Z');

  const last = paginateCommunityFeedRows(rows.slice(0, 2), 2);
  assert.equal(last.hasMore, false);
  assert.equal(last.nextCursor, null);
});
