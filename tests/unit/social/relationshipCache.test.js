const assert = require('node:assert/strict');
const test = require('node:test');
const {createRelationshipCache, relationshipCacheKey} = require('../../../src/modules/social/relationship-cache.service');
const {createSocialRepository} = require('../../../src/modules/social/social.repository');

function createRedis() {
  const values = new Map();
  return {
    isOpen: true,
    values,
    async get(key) { return values.get(key)?.value || null; },
    async setEx(key, ttl, value) { values.set(key, {ttl, value}); return 'OK'; },
    async del(...keys) { keys.flat().forEach(key => values.delete(key)); return keys.length; },
  };
}

test('relationship cache records hits/misses and uses a bounded TTL', async () => {
  const redis = createRedis();
  const metrics = [];
  const cache = createRelationshipCache({redis, ttlSeconds: 30, metrics: {increment: name => metrics.push(name)}});
  const value = {state: 'following', isBlocked: false};

  assert.equal(await cache.get({viewerId: 'viewer', targetId: 'target'}), null);
  await cache.set({viewerId: 'viewer', targetId: 'target'}, value);
  assert.deepEqual(await cache.get({viewerId: 'viewer', targetId: 'target'}), value);
  assert.deepEqual(redis.values.get(relationshipCacheKey('viewer', 'target')), {ttl: 30, value: JSON.stringify(value)});
  assert.deepEqual(metrics, ['relationship_cache.miss', 'relationship_cache.set', 'relationship_cache.hit']);
});

test('social relationship reads use the cache but mutations invalidate both viewer directions', async () => {
  const redis = createRedis();
  let relationshipReads = 0;
  const graph = {
    async ensureUser() {},
    async getRelationship() { relationshipReads += 1; return {state: 'none', isBlocked: false}; },
    async followUser() {},
  };
  const repository = createSocialRepository({graph, redis, cacheTtlSeconds: 30});

  await repository.relationship({viewerId: 'a', targetId: 'b'});
  await repository.relationship({viewerId: 'a', targetId: 'b'});
  assert.equal(relationshipReads, 1);

  await repository.follow({followerId: 'a', followeeId: 'b'});
  await repository.relationship({viewerId: 'a', targetId: 'b'});
  assert.equal(relationshipReads, 2);
  assert.equal(await repository.relationship({viewerId: 'b', targetId: 'a'}).then(result => result.state), 'none');
  assert.equal(relationshipReads, 3);
});

test('authoritative relationship reads bypass a cached value', async () => {
  const redis = createRedis();
  let relationshipReads = 0;
  const graph = {
    async ensureUser() {},
    async getRelationship() { relationshipReads += 1; return {state: 'following', isBlocked: false}; },
  };
  const repository = createSocialRepository({graph, redis});

  await repository.relationship({viewerId: 'a', targetId: 'b'});
  const result = await repository.relationship({viewerId: 'a', targetId: 'b', authoritative: true});
  assert.equal(result.state, 'following');
  assert.equal(relationshipReads, 2);
});

test('relationship operations do not erase graph user snapshots while ensuring nodes', async () => {
  const ensureCalls = [];
  const graph = {
    async ensureUser(input) { ensureCalls.push(input); },
    async getRelationship() { return {state: 'none', isBlocked: false}; },
  };
  const repository = createSocialRepository({graph, relationshipCache: {async get() { return null; }, async set() {}, async invalidate() {}}});

  await repository.relationship({viewerId: 'viewer', targetId: 'target'});

  assert.deepEqual(ensureCalls, [
    {userId: 'viewer', preserveExisting: true},
    {userId: 'target', preserveExisting: true},
  ]);
});

test('search block filtering ensures the authenticated viewer graph node exists before reading blocks', async () => {
  const calls = [];
  const graph = {
    async ensureUser(input) { calls.push(['ensure', input]); },
    async blockedUserIds(input) {
      calls.push(['blocks', input]);
      return [];
    },
  };
  const repository = createSocialRepository({graph});

  await repository.blockedUserIds({viewerId: 'viewer', targetIds: ['target']});
  assert.deepEqual(calls, [
    ['ensure', {userId: 'viewer', preserveExisting: true}],
    ['blocks', {viewerId: 'viewer', targetIds: ['target']}],
  ]);
});

test('repeating a private follow request returns the graph-owned request ID', async () => {
  const graph = {
    async ensureUser() {},
    async requestFollow() { return {records: [{get: () => 'existing-request'}]}; },
  };
  const repository = createSocialRepository({
    graph,
    relationshipCache: {async invalidate() {}},
  });

  const result = await repository.requestFollow({requesterId: 'a', targetId: 'b'});

  assert.equal(result.state, 'requested');
  assert.equal(result.requestId, 'existing-request');
});

test('request decisions use the graph-owned request ID lookup', async () => {
  const calls = [];
  const graph = {
    async findPendingRequest(input) { calls.push(['lookup', input]); return {id: 'r1', requesterId: 'a'}; },
    async acceptFollowRequest(input) { calls.push(['accept', input]); },
  };
  const repository = createSocialRepository({
    graph,
    relationshipCache: {async invalidate() {}},
  });

  await repository.acceptRequest({viewerId: 'b', requestId: 'r1'});

  assert.deepEqual(calls[0], ['lookup', {targetId: 'b', requestId: 'r1'}]);
  assert.equal(calls[1][0], 'accept');
  assert.equal(calls[1][1].requesterId, 'a');
});
