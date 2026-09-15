const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeJoinRequestIdentity,
  mapJoinRequestRow,
} = require('../../../src/modules/communities/community-join-request.service');

test('join request requires alias, username reveal, or both', () => {
  assert.throws(
    () => normalizeJoinRequestIdentity({useAlias: false, revealUsername: false}),
    /Choose an alias, your username, or both/,
  );
});

test('join request can send an editable alias only', () => {
  const identity = normalizeJoinRequestIdentity({
    useAlias: true,
    alias: '  NightOwl  ',
    revealUsername: false,
  });
  assert.deepEqual(identity, {
    alias: 'NightOwl',
    revealUsername: false,
    revealedUsername: '',
  });
});

test('join request can reveal username only without alias', () => {
  const identity = normalizeJoinRequestIdentity({
    useAlias: false,
    revealUsername: true,
    username: 'roy',
  });
  assert.deepEqual(identity, {
    alias: '',
    revealUsername: true,
    revealedUsername: 'roy',
  });
});

test('join request can send both alias and username', () => {
  const identity = normalizeJoinRequestIdentity({
    useAlias: true,
    alias: 'QuietFox',
    revealUsername: true,
    username: 'roy',
  });
  assert.equal(identity.alias, 'QuietFox');
  assert.equal(identity.revealUsername, true);
  assert.equal(identity.revealedUsername, 'roy');
});

test('admin-facing join request mapping keeps alias and optional username', () => {
  const request = mapJoinRequestRow({
    id: 'req-1',
    community_id: 'c-1',
    alias: 'NightOwl',
    reveal_username: true,
    revealed_username: 'roy',
    note: '',
    status: 'pending',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
  });
  assert.deepEqual(request, {
    id: 'req-1',
    communityId: 'c-1',
    alias: 'NightOwl',
    revealUsername: true,
    revealedUsername: 'roy',
    note: '',
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
});
