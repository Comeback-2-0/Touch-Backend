const assert = require('node:assert/strict');
const test = require('node:test');

const {
  mapCommunityRow,
  createPostgresCommunityRepository,
} = require('../../../src/modules/communities/postgres-community.repository');
const {
  shouldUsePostgres,
} = require('../../../src/modules/communities/community.repository');

function withEnv(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('postgres community rows map to API-compatible community shape', () => {
  const community = mapCommunityRow({
    id: 'community-1',
    name: 'Design',
    description: 'Design community',
    image: 'https://cdn.example.com/design.jpg',
    members_count: 12,
    trending_score: '4.5',
    created_at: new Date('2026-06-18T00:00:00.000Z'),
  });

  assert.deepEqual(community, {
    id: 'community-1',
    _id: 'community-1',
    name: 'Design',
    description: 'Design community',
    image: 'https://cdn.example.com/design.jpg',
    membersCount: 12,
    trendingScore: 4.5,
    rules: '',
    contentVisibility: 'public',
    joinMode: 'open',
    showLeadership: false,
    queueMode: 'manual',
    queueScheduleMinutes: null,
    queueSchedule: null,
    lastQueuePublishedAt: null,
    suspendedAt: null,
    createdAt: '2026-06-18T00:00:00.000Z',
    updatedAt: null,
  });
});

test('joining a community writes membership rows in PostgreSQL', async () => {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ query: strings.join('?'), values });
    return [{
      id: 'community-1',
      name: 'Design',
      description: '',
      image: '',
      members_count: 1,
      trending_score: 0,
      created_at: new Date('2026-06-18T00:00:00.000Z'),
      updated_at: new Date('2026-06-18T00:00:00.000Z'),
    }];
  };
  const repository = createPostgresCommunityRepository(sql);

  const community = await repository.joinCommunity({
    userId: 'user-1',
    communityId: 'community-1',
  });

  assert.equal(community.id, 'community-1');
  assert.match(calls[0].query, /insert into community_memberships/i);
  assert.match(calls[1].query, /update communities/i);
});

test('joining by request records alias and optional revealed username for admins', async () => {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({query: strings.join('?'), values});
    return [{
      id: 'request-1', community_id: 'community-1', user_id: 'user-1',
      alias: 'NightOwl', note: '', status: 'pending',
      reveal_username: true, revealed_username: 'roy',
      created_at: new Date('2026-01-01T00:00:00.000Z'), updated_at: new Date('2026-01-01T00:00:00.000Z'),
    }];
  };
  const repository = createPostgresCommunityRepository(sql);
  const request = await repository.requestJoin({
    userId: 'user-1',
    communityId: 'community-1',
    alias: 'NightOwl',
    revealUsername: true,
    revealedUsername: 'roy',
  });
  assert.equal(request.alias, 'NightOwl');
  assert.equal(request.revealUsername, true);
  assert.equal(request.revealedUsername, 'roy');
  assert.match(calls[0].query, /insert into community_join_requests/i);
  assert.match(calls[0].query, /reveal_username/i);
});

test('requester can load and cancel their own join request', async () => {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({query: strings.join('?'), values});
    if (String(strings.join('?')).includes('delete from community_join_requests')) {
      return [{id: 'request-1'}];
    }
    return [{
      id: 'request-1', community_id: 'community-1', user_id: 'user-1',
      alias: 'NightOwl', note: '', status: 'pending',
      reveal_username: false, revealed_username: '',
      created_at: new Date('2026-01-01T00:00:00.000Z'), updated_at: new Date('2026-01-01T00:00:00.000Z'),
    }];
  };
  const repository = createPostgresCommunityRepository(sql);
  const request = await repository.getJoinRequest({userId: 'user-1', communityId: 'community-1'});
  assert.equal(request.status, 'pending');
  const cancelled = await repository.cancelJoinRequest({userId: 'user-1', communityId: 'community-1'});
  assert.equal(cancelled, true);
  assert.match(calls[1].query, /delete from community_join_requests/i);
});

test('creating a community also makes its creator the active owner', async () => {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({query: strings.join('?'), values});
    return [{
      id: 'community-1', name: 'Quiet Corner', description: 'A private place', image: '',
      members_count: 1, trending_score: 0, created_at: new Date(), updated_at: new Date(),
    }];
  };
  const repository = createPostgresCommunityRepository(sql);

  const community = await repository.create({
    id: 'community-1', name: 'Quiet Corner', description: 'A private place',
    createdBy: 'user-1', contentVisibility: 'members', joinMode: 'approval',
  });

  assert.equal(community.id, 'community-1');
  assert.match(calls[0].query, /insert into communities/i);
  assert.match(calls[1].query, /insert into community_memberships/i);
  assert.equal(calls[1].values[0], 'user-1');
  assert.match(calls[1].query, /'owner'/i);
});

test('owners can update community visibility and queue settings', async () => {
  const calls = [];
  const sql = async (strings, ...values) => { calls.push({query: strings.join('?'), values}); return [{id:'community-1',name:'Quiet',description:'',image:'',members_count:1,trending_score:0,content_visibility:'members',join_mode:'approval',queue_mode:'scheduled',queue_schedule_minutes:60,created_at:new Date()}]; };
  const community = await createPostgresCommunityRepository(sql).update('community-1', {contentVisibility:'members', joinMode:'approval', queueMode:'scheduled', queueScheduleMinutes:60});
  assert.equal(community.queueMode, 'scheduled');
  assert.match(calls[0].query, /update communities/i);
});

test('ownership acceptance uses one postgres transaction for the role swap', async () => {
  let began = false;
  const sql = async () => [{id:'transfer-1',community_id:'community-1',from_user_id:'owner-1',to_user_id:'member-1'}];
  sql.begin = async callback => { began = true; return callback(sql); };
  const transfer = await createPostgresCommunityRepository(sql).acceptOwnershipTransfer({transferId:'transfer-1', userId:'member-1'});
  assert.equal(began, true);
  assert.equal(transfer.id, 'transfer-1');
});

test('audit history omits actor identities from its community-safe view', async () => {
  const sql = async () => [{id:'event-1', action:'content_removed', target_type:'content', target_id:'post-1', metadata:{}, created_at:new Date()}];
  const events = await createPostgresCommunityRepository(sql).listAudit('community-1');
  assert.equal(events[0].action, 'content_removed');
  assert.equal('actorId' in events[0], false);
});

test('muting a community stores a notification preference without changing membership', async () => {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({query: strings.join('?'), values});
    return [{user_id: 'user-1', community_id: 'community-1', muted: true}];
  };
  const repository = createPostgresCommunityRepository(sql);

  const preference = await repository.setCommunityNotificationMute({
    userId: 'user-1', communityId: 'community-1', muted: true,
  });

  assert.deepEqual(preference, {userId: 'user-1', communityId: 'community-1', muted: true});
  assert.match(calls[0].query, /insert into community_notification_preferences/i);
  assert.doesNotMatch(calls[0].query, /community_memberships/i);
});

test('approving a join request activates that requester without exposing a global profile', async () => {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({query: strings.join('?'), values});
    return [{id: 'request-1', community_id: 'community-1', user_id: 'user-1', alias: 'anon-rose', status: 'approved'}];
  };
  const repository = createPostgresCommunityRepository(sql);

  const request = await repository.reviewJoinRequest({requestId: 'request-1', reviewerId: 'mod-1', decision: 'approved'});

  assert.equal(request.status, 'approved');
  assert.match(calls[0].query, /update community_join_requests/i);
  assert.match(calls[1].query, /insert into community_memberships/i);
  assert.doesNotMatch(calls[0].query, /users/i);
});

test('production community store cannot silently fall back to Mongo', () => {
  withEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db', COMMUNITY_STORE: 'mongo' }, () => {
    assert.throws(
      () => shouldUsePostgres(),
      /Mongo community store is not allowed in production/,
    );
  });
});
