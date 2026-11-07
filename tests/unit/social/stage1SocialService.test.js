const assert = require('node:assert/strict');
const test = require('node:test');
const {createSocialService} = require('../../../src/modules/social/social.service');

function setup({privateTarget = false} = {}) {
  const calls = [];
  const socialRepository = {
    relationship: async () => ({state: 'none', isBlocked: false}),
    follow: async input => { calls.push(['follow', input]); return {state: 'following'}; },
    requestFollow: async input => { calls.push(['request', input]); return {state: 'requested'}; },
    unfollow: async input => { calls.push(['unfollow', input]); return {state: 'none'}; },
    block: async input => { calls.push(['block', input]); return {state: 'blocked_by_me'}; },
    unblock: async input => { calls.push(['unblock', input]); return {state: 'none'}; },
    mute: async input => { calls.push(['mute', input]); return {muted: true}; },
    unmute: async input => { calls.push(['unmute', input]); return {muted: false}; },
  };
  const userRepository = {findById: async id => ({id, isPrivate: privateTarget})};
  return {calls, service: createSocialService({socialRepository, userRepository})};
}

test('public follow creates an accepted relationship', async () => {
  const {calls, service} = setup();
  const result = await service.follow({viewerId: 'a', targetId: 'b'});
  assert.equal(result.state, 'following');
  assert.deepEqual(calls[0], ['follow', {followerId: 'a', followeeId: 'b'}]);
});

test('private follow creates a request instead of a follow', async () => {
  const {calls, service} = setup({privateTarget: true});
  const result = await service.follow({viewerId: 'a', targetId: 'b'});
  assert.equal(result.state, 'requested');
  assert.deepEqual(calls[0], ['request', {requesterId: 'a', targetId: 'b'}]);
});

test('repeating a follow action is idempotent and does not create a second graph mutation', async () => {
  const {calls, service} = setup();
  const relation = {state: 'following', isBlocked: false};
  const idempotentService = createSocialService({
    socialRepository: {
      relationship: async () => relation,
      follow: async input => { calls.push(['follow-again', input]); return {state: 'following'}; },
    },
    userRepository: {findById: async id => ({id, isPrivate: false})},
  });

  assert.deepEqual(await idempotentService.follow({viewerId: 'a', targetId: 'b'}), {state: 'following'});
  assert.deepEqual(calls, []);
  assert.deepEqual(await service.follow({viewerId: 'a', targetId: 'b'}), {state: 'following'});
});

test('repeating a private request returns the existing request state', async () => {
  const calls = [];
  const service = createSocialService({
    socialRepository: {
      relationship: async () => ({state: 'requested', isBlocked: false, requestId: 'request-1'}),
      requestFollow: async input => { calls.push(input); return {state: 'requested'}; },
    },
    userRepository: {findById: async id => ({id, isPrivate: true})},
  });

  assert.deepEqual(await service.follow({viewerId: 'a', targetId: 'b'}), {state: 'requested', requestId: 'request-1'});
  assert.deepEqual(calls, []);
});

test('self-follow is rejected before repository mutation', async () => {
  const {calls, service} = setup();
  await assert.rejects(() => service.follow({viewerId: 'a', targetId: 'a'}), {statusCode: 400});
  assert.equal(calls.length, 0);
});

test('relationship lookup rejects an unknown target before creating a graph node', async () => {
  let graphRead = false;
  const service = createSocialService({
    socialRepository: {
      async relationship() { graphRead = true; return {state: 'none', isBlocked: false}; },
    },
    userRepository: {findById: async () => null},
  });

  await assert.rejects(
    () => service.relationship({viewerId: 'viewer', targetId: 'missing'}),
    {statusCode: 404, code: 'PROFILE_NOT_FOUND'},
  );
  assert.equal(graphRead, false);
});

test('follower and following lists omit accounts blocked in either direction', async () => {
  const service = createSocialService({
    socialRepository: {
      async relationship() { return {state: 'none', isBlocked: false}; },
      async listUsers() { return [{id: 'blocked'}, {id: 'visible'}]; },
      async blockedUserIds({viewerId, targetIds}) {
        assert.equal(viewerId, 'viewer');
        assert.deepEqual(targetIds, ['blocked', 'visible']);
        return ['blocked'];
      },
    },
    userRepository: {findById: async id => ({id, isPrivate: false})},
  });

  const result = await service.listUsers({viewerId: 'viewer', targetId: 'target', direction: 'followers'});

  assert.deepEqual(result, [{id: 'visible'}]);
});

test('private follower and following lists require the owner or an approved follower', async () => {
  let listCalled = false;
  const service = createSocialService({
    socialRepository: {
      async relationship() { return {state: 'none', isBlocked: false}; },
      async listUsers() { listCalled = true; return []; },
    },
    userRepository: {findById: async id => ({id, isPrivate: true})},
  });

  await assert.rejects(
    () => service.listUsers({viewerId: 'viewer', targetId: 'target', direction: 'followers'}),
    {statusCode: 403, code: 'PRIVATE_PROFILE'},
  );
  assert.equal(listCalled, false);
});

test('incomplete accounts cannot become social-graph targets', async () => {
  const {calls, service} = setup();
  const incompleteService = createSocialService({
    socialRepository: {
      relationship: async () => ({state: 'none', isBlocked: false}),
      follow: async input => { calls.push(['follow-incomplete', input]); return {state: 'following'}; },
    },
    userRepository: {findById: async id => ({id, isProfileComplete: false, isPrivate: false})},
  });

  await assert.rejects(
    () => incompleteService.follow({viewerId: 'a', targetId: 'b'}),
    {statusCode: 404, code: 'PROFILE_NOT_FOUND'},
  );
  assert.deepEqual(calls, []);
});
