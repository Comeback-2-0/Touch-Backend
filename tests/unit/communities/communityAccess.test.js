const assert = require('node:assert/strict');
const test = require('node:test');

const {
  canViewCommunityContent,
  canManageCommunity,
  communityForDiscovery,
  communityForViewer,
} = require('../../../src/modules/communities/community-access');

test('private community content is unavailable to a non-member', () => {
  assert.equal(
    canViewCommunityContent({contentVisibility: 'members'}, null),
    false,
  );
});

test('active members can view private community content', () => {
  assert.equal(
    canViewCommunityContent({contentVisibility: 'members'}, {status: 'active', role: 'member'}),
    true,
  );
});

test('only owners and moderators can manage a community', () => {
  assert.equal(canManageCommunity({status: 'active', role: 'member'}), false);
  assert.equal(canManageCommunity({status: 'active', role: 'moderator'}), true);
});

test('private community rules are hidden from non-members', () => {
  const community = {name: 'Quiet', rules: 'Secret rules', contentVisibility: 'members', queueMode: 'manual'};
  assert.equal(communityForViewer(community, null).rules, undefined);
  assert.equal(communityForViewer(community, {status: 'active', role: 'member'}).rules, 'Secret rules');
});

test('discovery community cards never expose private rules or queue settings', () => {
  const community = {
    id: 'community-1',
    name: 'Quiet',
    rules: 'Secret rules',
    contentVisibility: 'members',
    joinMode: 'approval',
    queueMode: 'scheduled',
    queueScheduleMinutes: 60,
    queueSchedule: {type: 'daily'},
    showLeadership: true,
    lastQueuePublishedAt: '2026-09-16T00:00:00.000Z',
  };

  assert.deepEqual(communityForDiscovery(community), {
    id: 'community-1',
    name: 'Quiet',
    contentVisibility: 'members',
    joinMode: 'approval',
  });
});

test('suspended communities do not expose content to any viewer', () => {
  assert.equal(canViewCommunityContent({contentVisibility:'public', suspendedAt:'2026-09-15'}, {status:'active', role:'owner'}), false);
});
