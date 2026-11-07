const assert = require('node:assert/strict');
const test = require('node:test');
const {createPublicProfileService} = require('../../../src/modules/profiles/public-profile.service');

test('private profile projection hides owner statistics and posts from non-followers', async () => {
  const service = createPublicProfileService({
    userRepository: {findById: async () => ({id: 'b', name: 'B', username: 'b', bio: 'bio', profilePicture: 'p', isPrivate: true, followersCount: 9, followingCount: 8, postsCount: 7})},
    socialRepository: {relationship: async () => ({state: 'none', isBlocked: false})},
  });
  const profile = await service.getProfile({viewerId: 'a', targetId: 'b'});
  assert.equal(profile.name, 'B');
  assert.equal(profile.isPrivate, true);
  assert.equal(profile.postsVisible, false);
  assert.equal(profile.followersCount, undefined);
  assert.equal(profile.relationship.state, 'none');
});

test('profile owner receives owner-only statistics', async () => {
  const service = createPublicProfileService({
    userRepository: {findById: async () => ({id: 'a', name: 'A', username: 'a', bio: '', profilePicture: '', isPrivate: false, followersCount: 2, followingCount: 3, postsCount: 4})},
    socialRepository: {
      relationship: async () => ({state: 'none', isBlocked: false}),
      profileStats: async () => ({followersCount: 12, followingCount: 13}),
    },
  });
  const profile = await service.getProfile({viewerId: 'a', targetId: 'a'});
  assert.equal(profile.followersCount, 12);
  assert.equal(profile.followingCount, 13);
  assert.equal(profile.postsVisible, true);
});

test('public profile viewers can open follower lists without receiving owner statistics', async () => {
  const service = createPublicProfileService({
    userRepository: {findById: async () => ({id: 'b', name: 'B', username: 'b', bio: '', profilePicture: '', isPrivate: false, followersCount: 9, followingCount: 8, postsCount: 7})},
    socialRepository: {relationship: async () => ({state: 'none', isBlocked: false})},
  });
  const profile = await service.getProfile({viewerId: 'a', targetId: 'b'});
  assert.equal(profile.canViewLists, true);
  assert.equal(profile.followersCount, undefined);
  assert.equal(profile.followingCount, undefined);
});

test('the blocker receives a safe blocked projection so the account can be unblocked', async () => {
  const service = createPublicProfileService({
    userRepository: {findById: async () => ({id: 'b', name: 'B', username: 'b', bio: 'bio', profilePicture: 'p', isPrivate: false})},
    socialRepository: {relationship: async () => ({state: 'blocked_by_me', isBlocked: true})},
  });

  const profile = await service.getProfile({viewerId: 'a', targetId: 'b'});

  assert.equal(profile.id, 'b');
  assert.equal(profile.relationship.state, 'blocked_by_me');
  assert.equal(profile.postsVisible, false);
  assert.equal(profile.canViewLists, false);
  assert.equal(profile.name, '');
  assert.equal(profile.username, '');
});

test('a pending-deletion account is unavailable to profile viewers', async () => {
  const service = createPublicProfileService({
    userRepository: {
      findById: async () => ({id: 'b', deletionRequest: {status: 'pending'}}),
    },
    socialRepository: {relationship: async () => ({state: 'none', isBlocked: false})},
  });

  await assert.rejects(
    () => service.getProfile({viewerId: 'a', targetId: 'b'}),
    {statusCode: 404, code: 'PROFILE_NOT_FOUND'},
  );
});

test('an incomplete account is unavailable to public profile viewers', async () => {
  const service = createPublicProfileService({
    userRepository: {
      findById: async () => ({id: 'b', isProfileComplete: false, name: 'Incomplete', username: 'incomplete'}),
    },
    socialRepository: {relationship: async () => ({state: 'none', isBlocked: false})},
  });

  await assert.rejects(
    () => service.getProfile({viewerId: 'a', targetId: 'b'}),
    {statusCode: 404, code: 'PROFILE_NOT_FOUND'},
  );
});
