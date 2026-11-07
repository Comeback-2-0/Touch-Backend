const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createPostgresUserRepository,
  mapUserRow,
} = require('../../../src/modules/users/postgres-user.repository');

test('postgres user rows map to the service-compatible user shape', () => {
  const user = mapUserRow({
    id: 'user-1',
    firebase_uid: 'firebase-1',
    uid: 'legacy-1',
    name: 'Maya',
    email: 'maya@example.com',
    photo: 'https://cdn.example.com/google.jpg',
    username: 'maya',
    bio: 'hello',
    profile_picture: 'https://cdn.example.com/profile.jpg',
    profile_picture_public_id: 'touch/profile/maya',
    is_private: true,
    is_profile_complete: true,
    followers_count: 3,
    following_count: 4,
    posts_count: 5,
    role: 'admin',
    last_login_at: new Date('2026-06-18T00:00:00.000Z'),
  });

  assert.equal(user._id, 'user-1');
  assert.equal(user.id, 'user-1');
  assert.equal(user.firebaseUid, 'firebase-1');
  assert.equal(user.profilePicture, 'https://cdn.example.com/profile.jpg');
  assert.equal(user.profilePicturePublicId, 'touch/profile/maya');
  assert.equal(user.isPrivate, true);
  assert.equal(user.isProfileComplete, true);
  assert.equal(user.postsCount, 5);
  assert.equal(user.role, 'admin');
});

test('create uses empty strings for not-null profile fields when Google sign-in omits them', async () => {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ query: strings.join('?'), values });
    return [{
      id: values[0],
      firebase_uid: values[1],
      uid: values[2],
      name: values[3],
      email: values[4],
      photo: values[5],
      username: values[6],
      bio: values[7],
      profile_picture: values[8],
      profile_picture_public_id: values[9],
      is_private: values[10],
      is_profile_complete: values[11],
      followers_count: values[12],
      following_count: values[13],
      posts_count: values[14],
      role: values[15],
      last_login_at: values[16],
    }];
  };
  const repository = createPostgresUserRepository(sql);

  const user = await repository.create({
    id: 'user-1',
    firebaseUid: 'google-1',
    uid: 'google-1',
    name: 'Indrajit Roy',
    email: 'roy@example.com',
    photo: 'https://lh3.googleusercontent.com/avatar.jpg',
    lastLoginAt: new Date('2026-06-18T00:00:00.000Z'),
  });

  assert.equal(user.bio, '');
  assert.equal(user.profilePicture, '');
  assert.equal(user.profilePicturePublicId, '');
  assert.notEqual(calls[0].values[7], null);
  assert.notEqual(calls[0].values[8], null);
  assert.notEqual(calls[0].values[9], null);
});

test('profile update and graph lifecycle outbox insert share one PostgreSQL transaction', async () => {
  const calls = [];
  const userRow = {
    id: 'user-1',
    name: 'Updated Name',
    username: 'updated',
    profile_picture: '',
    is_profile_complete: true,
    deletion_request: null,
  };
  const sql = async (strings, ...values) => {
    const query = strings.join('?');
    calls.push({query, values});
    if (/update users/i.test(query)) return [userRow];
    return [];
  };
  sql.json = value => value;
  sql.begin = async callback => {
    calls.push({query: 'begin'});
    const transaction = async (strings, ...values) => sql(strings, ...values);
    transaction.json = sql.json;
    return callback(transaction);
  };

  const repository = createPostgresUserRepository(sql);
  const result = await repository.updateByIdWithLifecycle('user-1', {name: 'Updated Name'});

  assert.equal(result.user._id, 'user-1');
  assert.equal(result.lifecycleQueued, true);
  assert.equal(calls[0].query, 'begin');
  assert.match(calls[1].query, /update users/i);
  assert.match(calls[2].query, /insert into user_graph_outbox/i);
  assert.match(calls[3].query, /insert into user_search_outbox/i);
});

test('user creation and graph lifecycle outbox insert share one PostgreSQL transaction', async () => {
  const calls = [];
  const userRow = {
    id: 'user-2',
    name: 'New User',
    username: '',
    profile_picture: '',
    is_profile_complete: false,
    deletion_request: null,
  };
  const sql = async (strings, ...values) => {
    const query = strings.join('?');
    calls.push({query, values});
    if (/insert into users/i.test(query)) return [userRow];
    return [];
  };
  sql.json = value => value;
  sql.begin = async callback => {
    calls.push({query: 'begin'});
    const transaction = async (strings, ...values) => sql(strings, ...values);
    transaction.json = sql.json;
    return callback(transaction);
  };

  const repository = createPostgresUserRepository(sql);
  const result = await repository.createWithLifecycle({id: 'user-2', name: 'New User', email: 'new@example.com'});

  assert.equal(result.user._id, 'user-2');
  assert.equal(result.lifecycleQueued, true);
  assert.equal(calls[0].query, 'begin');
  assert.match(calls[1].query, /insert into users/i);
  assert.match(calls[2].query, /insert into user_graph_outbox/i);
  assert.match(calls[3].query, /insert into user_search_outbox/i);
});
