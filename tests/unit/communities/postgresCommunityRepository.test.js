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

test('production community store cannot silently fall back to Mongo', () => {
  withEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db', COMMUNITY_STORE: 'mongo' }, () => {
    assert.throws(
      () => shouldUsePostgres(),
      /Mongo community store is not allowed in production/,
    );
  });
});
