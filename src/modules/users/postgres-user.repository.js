const { v4: uuidv4 } = require('uuid');
const { getPostgresClient } = require('../../database/postgresClient');
const { lifecycleOutboxEvent } = require('./user-lifecycle.payload');

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapUserRow(row) {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    firebaseUid: row.firebase_uid || '',
    uid: row.uid || '',
    appleSubject: row.apple_subject || '',
    appleRelayEmail: row.apple_relay_email || '',
    deletionRequest: row.deletion_request || null,
    name: row.name || '',
    email: row.email || '',
    photo: row.photo || '',
    username: row.username || '',
    bio: row.bio || '',
    profilePicture: row.profile_picture || '',
    profilePicturePublicId: row.profile_picture_public_id || '',
    isPrivate: Boolean(row.is_private),
    isProfileComplete: Boolean(row.is_profile_complete),
    followersCount: Number(row.followers_count || 0),
    followingCount: Number(row.following_count || 0),
    postsCount: Number(row.posts_count || 0),
    role: row.role || 'user',
    lastLoginAt: toIso(row.last_login_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function clean(value) {
  return value === undefined ? null : value;
}

function textDefault(value) {
  return value === undefined || value === null ? '' : value;
}

async function updateByIdQuery(sql, userId, update) {
  const rows = await sql`
    update users
    set
      apple_subject = coalesce(${clean(update.appleSubject)}, apple_subject),
      apple_relay_email = coalesce(${clean(update.appleRelayEmail)}, apple_relay_email),
      name = coalesce(${clean(update.name)}, name),
      firebase_uid = coalesce(${clean(update.firebaseUid)}, firebase_uid),
      uid = coalesce(${clean(update.uid)}, uid),
      photo = coalesce(${clean(update.photo)}, photo),
      username = coalesce(${clean(update.username)}, username),
      bio = coalesce(${clean(update.bio)}, bio),
      profile_picture = coalesce(${clean(update.profilePicture)}, profile_picture),
      profile_picture_public_id = coalesce(${clean(update.profilePicturePublicId)}, profile_picture_public_id),
      is_private = coalesce(${update.isPrivate === undefined ? null : Boolean(update.isPrivate)}, is_private),
      is_profile_complete = coalesce(${update.isProfileComplete === undefined ? null : Boolean(update.isProfileComplete)}, is_profile_complete),
      last_login_at = coalesce(${clean(update.lastLoginAt)}, last_login_at),
      updated_at = now()
    where id = ${String(userId)}
    returning *
  `;
  return mapUserRow(rows[0]);
}

async function requestDeletionQuery(sql, userId, request) {
  const rows = await sql`
    update users
    set deletion_request = coalesce(deletion_request, ${sql.json(request)}), updated_at = now()
    where id = ${String(userId)}
    returning *
  `;
  return mapUserRow(rows[0]);
}

async function insertLifecycleOutbox(sql, user, operation) {
  const event = lifecycleOutboxEvent(user, operation);
  const toJson = typeof sql.json === 'function' ? sql.json.bind(sql) : JSON.stringify;
  await sql`
    insert into user_graph_outbox (id, user_id, operation, payload)
    values (${event.eventId}, ${event.userId}, ${event.operation}, ${toJson(event.payload)})
    on conflict do nothing
  `;
  await sql`
    insert into user_search_outbox (id, user_id, operation, payload)
    values (${event.eventId}, ${event.userId}, ${event.operation}, ${toJson(event.payload)})
    on conflict do nothing
  `;
}

async function createUserQuery(sql, input) {
  const id = input.id || uuidv4();
  const rows = await sql`
    insert into users (
      id, firebase_uid, uid, name, email, photo, username, bio,
      profile_picture, profile_picture_public_id, is_private,
      is_profile_complete, followers_count, following_count,
      posts_count, role, last_login_at, apple_subject, apple_relay_email
    )
    values (
      ${id}, ${clean(input.firebaseUid)}, ${clean(input.uid)}, ${clean(input.name)},
      ${clean(input.email)}, ${textDefault(input.photo)}, ${clean(input.username)},
      ${textDefault(input.bio)}, ${textDefault(input.profilePicture)},
      ${textDefault(input.profilePicturePublicId)}, ${Boolean(input.isPrivate)},
      ${Boolean(input.isProfileComplete)}, ${Number(input.followersCount || 0)},
      ${Number(input.followingCount || 0)}, ${Number(input.postsCount || 0)},
      ${input.role || 'user'}, ${clean(input.lastLoginAt)}, ${clean(input.appleSubject)}, ${clean(input.appleRelayEmail)}
    )
    returning *
  `;
  return mapUserRow(rows[0]);
}

function createPostgresUserRepository(sql = getPostgresClient()) {
  async function first(queryPromise) {
    const rows = await queryPromise;
    return mapUserRow(rows[0]);
  }

  return {
    findByAppleSubject(subject) {
      return first(sql`select * from users where apple_subject = ${subject} limit 1`);
    },
    async requestDeletion(userId, request) {
      return requestDeletionQuery(sql, userId, request);
    },
    async requestDeletionWithLifecycle(userId, request) {
      if (typeof sql.begin !== 'function') {
        return {user: await requestDeletionQuery(sql, userId, request), lifecycleQueued: false};
      }
      return sql.begin(async transaction => {
        const user = await requestDeletionQuery(transaction, userId, request);
        if (user) await insertLifecycleOutbox(transaction, user, 'delete');
        return {user, lifecycleQueued: true};
      });
    },
    async markDeletionEmailSent(userId, sentAt) {
      await sql`update users set deletion_request = jsonb_set(deletion_request, '{adminEmailSentAt}', ${sql.json(sentAt)}) where id = ${String(userId)}`;
    },
    async findPendingDeletionEmails() {
      const rows=await sql`select * from users where deletion_request->>'status' = 'pending' and deletion_request->>'adminEmailSentAt' is null limit 100`;
      return rows.map(mapUserRow);
    },
    findById(userId) {
      return first(sql`
        select * from users
        where id = ${String(userId)}
        limit 1
      `);
    },
    findByEmail(email) {
      return first(sql`
        select * from users
        where lower(email) = lower(${String(email)})
        limit 1
      `);
    },
    findByUsername(username) {
      return first(sql`
        select * from users
        where username = ${String(username)}
        limit 1
      `);
    },
    async findUsernameOwner(username, excludeUserId) {
      const rows = excludeUserId
        ? await sql`
          select * from users
          where username = ${String(username)}
            and id <> ${String(excludeUserId)}
          limit 1
        `
        : await sql`
          select * from users
          where username = ${String(username)}
          limit 1
        `;
      return mapUserRow(rows[0]);
    },
    async create(input) {
      return createUserQuery(sql, input);
    },
    async createWithLifecycle(input, {operation = 'upsert'} = {}) {
      if (typeof sql.begin !== 'function') {
        return {user: await createUserQuery(sql, input), lifecycleQueued: false};
      }
      return sql.begin(async transaction => {
        const user = await createUserQuery(transaction, input);
        if (user) await insertLifecycleOutbox(transaction, user, operation);
        return {user, lifecycleQueued: true};
      });
    },
    updateById(userId, update) { return updateByIdQuery(sql, userId, update); },
    async updateByIdWithLifecycle(userId, update, {operation = 'upsert'} = {}) {
      if (typeof sql.begin !== 'function') {
        return {user: await updateByIdQuery(sql, userId, update), lifecycleQueued: false};
      }
      return sql.begin(async transaction => {
        const user = await updateByIdQuery(transaction, userId, update);
        if (user) await insertLifecycleOutbox(transaction, user, operation);
        return {user, lifecycleQueued: true};
      });
    },
    async incrementPostsCount(userId, by = 1) {
      const rows = await sql`
        update users
        set posts_count = posts_count + ${Number(by)}, updated_at = now()
        where id = ${String(userId)}
        returning *
      `;
      return mapUserRow(rows[0]);
    },
  };
}

module.exports = {
  createPostgresUserRepository,
  mapUserRow,
};
