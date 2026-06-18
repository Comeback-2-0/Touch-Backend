const { v4: uuidv4 } = require('uuid');
const { getPostgresClient } = require('../../database/postgresClient');

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

function createPostgresUserRepository(sql = getPostgresClient()) {
  async function first(queryPromise) {
    const rows = await queryPromise;
    return mapUserRow(rows[0]);
  }

  return {
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
      const id = input.id || uuidv4();
      const rows = await sql`
        insert into users (
          id, firebase_uid, uid, name, email, photo, username, bio,
          profile_picture, profile_picture_public_id, is_private,
          is_profile_complete, followers_count, following_count,
          posts_count, role, last_login_at
        )
        values (
          ${id}, ${clean(input.firebaseUid)}, ${clean(input.uid)}, ${clean(input.name)},
          ${clean(input.email)}, ${textDefault(input.photo)}, ${clean(input.username)},
          ${textDefault(input.bio)}, ${textDefault(input.profilePicture)},
          ${textDefault(input.profilePicturePublicId)}, ${Boolean(input.isPrivate)},
          ${Boolean(input.isProfileComplete)}, ${Number(input.followersCount || 0)},
          ${Number(input.followingCount || 0)}, ${Number(input.postsCount || 0)},
          ${input.role || 'user'}, ${clean(input.lastLoginAt)}
        )
        returning *
      `;
      return mapUserRow(rows[0]);
    },
    async updateById(userId, update) {
      const rows = await sql`
        update users
        set
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
