const assert = require('node:assert/strict');
const test = require('node:test');
const {createSocialRepository} = require('../../../src/modules/social/social.repository');

test('a graph block race cannot turn a rejected follow write into Following', async () => {
  const repository = createSocialRepository({
    graph: {
      async ensureUser() {},
      async followUser() { return {records: []}; },
      async getRelationship() { return {state: 'none', isBlocked: false}; },
    },
    relationshipCache: {async invalidate() {}},
  });

  await assert.rejects(
    () => repository.follow({followerId: 'actor', followeeId: 'target'}),
    {statusCode: 403, code: 'RELATIONSHIP_BLOCKED'},
  );
});

test('social mutations sync authoritative user snapshots before graph notification writes', async () => {
  const ensured = [];
  const repository = createSocialRepository({
    userRepository: {
      async findById(id) {
        return {
          id,
          name: id === 'actor' ? 'Actor Name' : 'Target Name',
          username: id === 'actor' ? 'actor_name' : 'target_name',
          profilePicture: `${id}-photo`,
          isProfileComplete: true,
        };
      },
    },
    graph: {
      async ensureUser(input) { ensured.push(input); },
      async followUser() { return {records: [{}]}; },
    },
    relationshipCache: {async invalidate() {}},
  });

  await repository.follow({followerId: 'actor', followeeId: 'target'});

  assert.deepEqual(ensured, [
    {
      userId: 'actor',
      name: 'Actor Name',
      username: 'actor_name',
      profilePicture: 'actor-photo',
      accountActive: true,
      preserveExisting: true,
    },
    {
      userId: 'target',
      name: 'Target Name',
      username: 'target_name',
      profilePicture: 'target-photo',
      accountActive: true,
      preserveExisting: true,
    },
  ]);
});

test('a graph block race cannot turn a rejected follow request into Requested', async () => {
  const repository = createSocialRepository({
    graph: {
      async ensureUser() {},
      async requestFollow() { return {records: []}; },
      async getRelationship() { return {state: 'none', isBlocked: false}; },
    },
    relationshipCache: {async invalidate() {}},
  });

  await assert.rejects(
    () => repository.requestFollow({requesterId: 'actor', targetId: 'target'}),
    {statusCode: 403, code: 'RELATIONSHIP_BLOCKED'},
  );
});

test('an accept write that loses the block race is rejected safely', async () => {
  const repository = createSocialRepository({
    graph: {
      async findPendingRequest() { return {requesterId: 'actor', id: 'request-1'}; },
      async acceptFollowRequest() { return {records: []}; },
      async getRelationship() { return {state: 'blocked_by_me', isBlocked: true}; },
    },
    relationshipCache: {async invalidate() {}},
  });

  await assert.rejects(
    () => repository.acceptRequest({viewerId: 'target', requestId: 'request-1'}),
    {statusCode: 403, code: 'RELATIONSHIP_BLOCKED'},
  );
});

test('a repeated accept after another worker already accepted is idempotent', async () => {
  const repository = createSocialRepository({
    graph: {
      async findPendingRequest() { return {requesterId: 'actor', id: 'request-1'}; },
      async acceptFollowRequest() { return {records: []}; },
      async getRelationship() { return {state: 'following', isBlocked: false}; },
    },
    relationshipCache: {async invalidate() {}},
  });

  assert.deepEqual(await repository.acceptRequest({viewerId: 'target', requestId: 'request-1'}), {state: 'following'});
});

test('an accept retry after the first response was lost reads the accepted request', async () => {
  let acceptCalls = 0;
  const repository = createSocialRepository({
    graph: {
      async findFollowRequest() {
        return {requesterId: 'actor', id: 'request-1', status: 'accepted'};
      },
      async acceptFollowRequest() { acceptCalls += 1; },
      async getRelationship() { return {state: 'following', isBlocked: false}; },
    },
    relationshipCache: {async invalidate() {}},
  });

  assert.deepEqual(await repository.acceptRequest({viewerId: 'target', requestId: 'request-1'}), {state: 'following'});
  assert.equal(acceptCalls, 0);
});
