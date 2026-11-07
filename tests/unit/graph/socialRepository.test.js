const assert = require('node:assert/strict');
const test = require('node:test');

const { createSocialGraphRepository } = require('../../../src/modules/graph/social.repository');

function createDriver(readRecords = []) {
  const runs = [];
  return {
    runs,
    driver: {
      session(options) {
        runs.push({ sessionOptions: options });
        return {
          async executeWrite(work) {
            return work({
              async run(cypher, params) {
                runs.push({ cypher, params });
                return { records: [] };
              },
            });
          },
          async executeRead(work) {
            return work({
              async run(cypher, params) {
                runs.push({cypher, params});
                return {records: readRecords};
              },
            });
          },
          async close() {},
        };
      },
    },
  };
}

test('stable user relationships are stored in Neo4j', async () => {
  const { driver, runs } = createDriver();
  const repository = createSocialGraphRepository({ driver, database: 'neo4j' });

  await repository.followUser({ followerId: 'user-1', followeeId: 'user-2', notification: {id: 'n1', type: 'follow', recipientId: 'user-2', actorId: 'user-1', targetType: 'profile', targetId: 'user-1', dedupeKey: 'follow:user-1:user-2'} });
  await repository.blockUser({ blockerId: 'user-1', blockedId: 'user-3' });

  const writes = runs.filter(entry => entry.cypher);
  assert.match(writes[0].cypher, /\[r:FOLLOWS\]/);
  assert.match(writes[0].cypher, /SocialNotificationOutbox/);
  assert.match(writes[0].cypher, /actorName/);
  assert.match(writes[1].cypher, /\[r:BLOCKS\]/);
  assert.match(writes[1].cypher, /REQUESTED_TO_FOLLOW/);
  assert.match(writes[1].cypher, /FOLLOWS/);
  assert.match(writes[1].cypher, /SocialNotificationOutbox/);
  assert.match(writes[1].cypher, /o\.status IN \['pending', 'processing'\]/);
  assert.match(writes[1].cypher, /DELETE o/);
  assert.match(writes[0].cypher, /updatedAt/);
  assert.deepEqual(runs[0].sessionOptions, { database: 'neo4j' });
});

test('community membership mirrors are stored in Neo4j', async () => {
  const { driver, runs } = createDriver();
  const repository = createSocialGraphRepository({ driver });

  await repository.mirrorMembership({ userId: 'user-1', communityId: 'community-1' });

  const write = runs.find(entry => entry.cypher);
  assert.match(write.cypher, /\(c:Community \{id: \$communityId\}\)/);
  assert.match(write.cypher, /\[r:MEMBER_OF\]/);
});

test('batch block filtering reads all search candidates in one Neo4j query', async () => {
  const {driver, runs} = createDriver([
    {toObject: () => ({targetId: 'blocked', blockedByMe: true, blockedMe: false})},
  ]);
  const repository = createSocialGraphRepository({driver});

  const blocked = await repository.blockedUserIds({viewerId: 'viewer', targetIds: ['blocked', 'visible']});

  assert.deepEqual(blocked, ['blocked']);
  const query = runs.find(entry => entry.cypher && entry.cypher.includes('UNWIND'));
  assert.ok(query);
  assert.match(query.cypher, /BLOCKS/);
  assert.deepEqual(query.params.targetIds, ['blocked', 'visible']);
});

test('profile statistics count authoritative Neo4j follow edges', async () => {
  const {driver, runs} = createDriver([{
    toObject: () => ({
      followersCount: {toNumber: () => 12},
      followingCount: {toNumber: () => 13},
    }),
  }]);
  const repository = createSocialGraphRepository({driver});

  assert.deepEqual(await repository.getProfileStats({userId: 'owner'}), {
    followersCount: 12,
    followingCount: 13,
  });
  const query = runs.find(entry => entry.cypher && entry.cypher.includes('count(follower)'));
  assert.ok(query);
  assert.match(query.cypher, /FOLLOWS/);
  assert.match(query.cypher, /coalesce\(follower\.accountActive, false\) = true/);
  assert.match(query.cypher, /coalesce\(following\.accountActive, false\) = true/);
  assert.equal(query.params.userId, 'owner');
});

test('relationship reads preserve mute state for profile reloads', async () => {
  const {driver} = createDriver([{
    toObject: () => ({
      following: true,
      requested: false,
      blockedByMe: false,
      blockedMe: false,
      mutedByMe: true,
      requestId: null,
    }),
  }]);
  const repository = createSocialGraphRepository({driver});

  assert.deepEqual(await repository.getRelationship({viewerId: 'viewer', targetId: 'target'}), {
    state: 'following',
    isBlocked: false,
    mutedByMe: true,
  });
});

test('notification outbox maps Neo4j properties to the worker contract', async () => {
  const outbox = {
    id: 'event-1',
    type: 'follow_request',
    recipientId: 'target',
    actorId: 'actor',
    targetType: 'follow_requests',
    targetId: 'target',
    dedupeKey: 'follow_request:actor:target',
    payload: JSON.stringify({targetType: 'follow_requests', actorUserId: 'actor'}),
    status: 'pending',
  };
  const {driver} = createDriver([{
    get(key) {
      if (key === 'o') return {properties: outbox};
      if (key === 'a') return {properties: {name: 'Actor', username: 'actor_name', profilePicture: 'photo'}};
      return null;
    },
  }]);
  const repository = createSocialGraphRepository({driver});

  const [row] = await repository.listNotificationOutbox();

  assert.deepEqual(row, {
    id: 'event-1',
    type: 'follow_request',
    recipient_id: 'target',
    actor_id: 'actor',
    target_type: 'follow_requests',
    target_id: 'target',
    dedupe_key: 'follow_request:actor:target',
    payload: {targetType: 'follow_requests', actorUserId: 'actor'},
    status: 'pending',
    actor_name: 'Actor',
    actor_username: 'actor_name',
    actor_profile_picture: 'photo',
  });
});

test('notification outbox reclaims stale processing events after a worker crash', async () => {
  const {driver, runs} = createDriver([]);
  const repository = createSocialGraphRepository({driver});

  await repository.listNotificationOutbox();
  await repository.claimNotificationOutbox('event-1');

  const listQuery = runs.find(entry => entry.cypher && entry.cypher.includes('SocialNotificationOutbox'));
  const claimQuery = runs.find(entry => entry.cypher && entry.cypher.includes("SET o.status = 'processing'"));
  assert.match(listQuery.cypher, /status = 'processing'/);
  assert.match(listQuery.cypher, /duration\(\{minutes: 5\}\)/);
  assert.match(claimQuery.cypher, /updatedAt = datetime\(\)/);
});

test('pending follow requests include the requester display projection', async () => {
  const {driver, runs} = createDriver([{
    toObject: () => ({id: 'request-1', requesterId: 'actor', name: 'Actor', username: 'actor_name', profilePicture: 'photo'}),
  }]);
  const repository = createSocialGraphRepository({driver});

  const requests = await repository.listPendingRequests({targetId: 'target'});

  assert.deepEqual(requests, [{
    id: 'request-1',
    requesterId: 'actor',
    name: 'Actor',
    username: 'actor_name',
    profilePicture: 'photo',
  }]);
  const query = runs.find(entry => entry.cypher && entry.cypher.includes('REQUESTED_TO_FOLLOW'));
  assert.match(query.cypher, /a\.name/);
  assert.match(query.cypher, /a\.username/);
  assert.match(query.cypher, /a\.profilePicture/);
  assert.match(query.cypher, /coalesce\(a\.accountActive, false\) = true/);
  assert.match(query.cypher, /q\.status = 'pending'/);
});

test('pending follow request lookup is scoped by request ID and recipient', async () => {
  const {driver, runs} = createDriver([{
    toObject: () => ({id: 'request-1', requesterId: 'actor', name: 'Actor'}),
  }]);
  const repository = createSocialGraphRepository({driver});

  assert.deepEqual(await repository.findPendingRequest({targetId: 'target', requestId: 'request-1'}), {
    id: 'request-1', requesterId: 'actor', name: 'Actor',
  });
  const query = runs.find(entry => entry.cypher && entry.cypher.includes('requestId: $requestId'));
  assert.ok(query);
  assert.match(query.cypher, /q\.status = 'pending'/);
  assert.deepEqual(query.params, {targetId: 'target', requestId: 'request-1'});
  assert.match(query.cypher, /coalesce\(a\.accountActive, false\) = true/);
});

test('follow request lookup returns status for idempotent accept retries', async () => {
  const {driver, runs} = createDriver([{
    toObject: () => ({id: 'request-1', status: 'accepted', requesterId: 'actor'}),
  }]);
  const repository = createSocialGraphRepository({driver});

  assert.deepEqual(await repository.findFollowRequest({targetId: 'target', requestId: 'request-1'}), {
    id: 'request-1', status: 'accepted', requesterId: 'actor',
  });
  const query = runs.find(entry => entry.cypher && entry.cypher.includes('q.status AS status'));
  assert.ok(query);
  assert.match(query.cypher, /coalesce\(a\.accountActive, false\) = true/);
  assert.match(query.cypher, /coalesce\(b\.accountActive, false\) = true/);
  assert.deepEqual(query.params, {targetId: 'target', requestId: 'request-1'});
});

test('relationship lists ignore explicitly deactivated graph users', async () => {
  const {driver, runs} = createDriver([]);
  const repository = createSocialGraphRepository({driver});

  await repository.listUsers({targetId: 'target', direction: 'followers', limit: -10});

  const query = runs.find(entry => entry.cypher && entry.cypher.includes('RETURN u'));
  assert.match(query.cypher, /coalesce\(u\.accountActive, false\) = true/);
  assert.equal(query.params.limit.toNumber(), 20);
  assert.equal(query.params.limit.constructor.name, 'Integer');
});

test('follow and request notifications are emitted only for a newly-created relationship', async () => {
  const {driver, runs} = createDriver();
  const repository = createSocialGraphRepository({driver});

  await repository.followUser({
    followerId: 'actor',
    followeeId: 'target',
    notification: {id: 'event-1', dedupeKey: 'follow:actor:target:event-1'},
  });
  await repository.requestFollow({
    requesterId: 'actor',
    targetId: 'private-target',
    requestId: 'request-1',
    notification: {id: 'event-2', dedupeKey: 'follow_request:actor:private-target:request-1'},
  });

  const writes = runs.filter(entry => entry.cypher);
  assert.match(writes[0].cypher, /creationEventId/);
  assert.match(writes[0].cypher, /relationshipCreated/);
  assert.match(writes[0].cypher, /relationshipCreated AND \$dedupeKey/);
  assert.match(writes[1].cypher, /creationEventId/);
  assert.match(writes[1].cypher, /relationshipCreated/);
  assert.match(writes[1].cypher, /relationshipCreated AND \$dedupeKey/);
  assert.match(writes[1].cypher, /status/);
  assert.match(writes[1].cypher, /pending/);
});

test('follow, request, and accept writes enforce block precedence inside Neo4j', async () => {
  const {driver, runs} = createDriver();
  const repository = createSocialGraphRepository({driver});

  await repository.followUser({followerId: 'actor', followeeId: 'target'});
  await repository.requestFollow({requesterId: 'actor', targetId: 'target', requestId: 'request-1'});
  await repository.acceptFollowRequest({requesterId: 'actor', targetId: 'target'});

  const writes = runs.filter(entry => entry.cypher);
  assert.match(writes[0].cypher, /NOT \(a\)-\[:BLOCKS\]->\(b\)/);
  assert.match(writes[0].cypher, /NOT \(b\)-\[:BLOCKS\]->\(a\)/);
  assert.match(writes[1].cypher, /NOT \(a\)-\[:BLOCKS\]->\(b\)/);
  assert.match(writes[1].cypher, /NOT \(b\)-\[:BLOCKS\]->\(a\)/);
  assert.match(writes[2].cypher, /NOT \(a\)-\[:BLOCKS\]->\(b\)/);
  assert.match(writes[2].cypher, /NOT \(b\)-\[:BLOCKS\]->\(a\)/);
});

test('relationship writes require both graph users to be active', async () => {
  const {driver, runs} = createDriver();
  const repository = createSocialGraphRepository({driver});

  await repository.followUser({followerId: 'actor', followeeId: 'target'});
  await repository.requestFollow({requesterId: 'actor', targetId: 'target', requestId: 'request-1'});
  await repository.acceptFollowRequest({requesterId: 'actor', targetId: 'target'});
  await repository.muteUser({muterId: 'actor', mutedId: 'target'});
  await repository.blockUser({blockerId: 'actor', blockedId: 'target'});

  const writes = runs.filter(entry => entry.cypher);
  expectActivePair(writes[0].cypher);
  expectActivePair(writes[1].cypher);
  expectActivePair(writes[2].cypher);
  expectActivePair(writes[3].cypher);
  expectActivePair(writes[4].cypher);
});

function expectActivePair(cypher) {
  assert.match(cypher, /coalesce\(a\.accountActive, false\) = true/);
  assert.match(cypher, /coalesce\(b\.accountActive, false\) = true/);
}

test('request and accept writes keep the graph target separate from notification metadata', async () => {
  const {driver, runs} = createDriver();
  const repository = createSocialGraphRepository({driver});

  await repository.requestFollow({requesterId: 'actor', targetId: 'target', requestId: 'request-1'});
  await repository.acceptFollowRequest({requesterId: 'actor', targetId: 'target'});

  const writes = runs.filter(entry => entry.cypher);
  assert.equal(writes[0].params.targetId, 'target');
  assert.equal(writes[0].params.notificationTargetId, null);
  assert.equal(writes[1].params.targetId, 'target');
  assert.equal(writes[1].params.notificationTargetId, null);
});

test('request decisions close the graph request with a status instead of deleting history', async () => {
  const {driver, runs} = createDriver();
  const repository = createSocialGraphRepository({driver});

  await repository.acceptFollowRequest({requesterId: 'actor', targetId: 'target'});
  await repository.rejectFollowRequest({requesterId: 'actor', targetId: 'target'});

  const acceptQuery = runs.find(entry => entry.cypher && entry.cypher.includes("q.status = 'pending'"));
  const rejectQuery = runs.find(entry => entry.cypher && entry.cypher.includes("q.status = 'rejected'"));
  assert.ok(acceptQuery);
  assert.match(acceptQuery.cypher, /q\.status = 'accepted'/);
  assert.doesNotMatch(acceptQuery.cypher, /DELETE q/);
  assert.ok(rejectQuery);
  assert.match(rejectQuery.cypher, /q\.status = 'rejected'/);
  assert.doesNotMatch(rejectQuery.cypher, /DELETE q/);
});
