const { getPostgresClient } = require('../../database/postgresClient');

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRefreshSessionRow(row) {
  if (!row) return null;

  return {
    sessionId: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
    revokedAt: toIso(row.revoked_at),
  };
}

function createPostgresRefreshSessionRepository(sql = getPostgresClient()) {
  return {
    async store({ sessionId, userId, tokenHash, createdAt, expiresAt }) {
      const rows = await sql`
        insert into refresh_sessions (
          id, user_id, token_hash, created_at, expires_at, revoked_at
        )
        values (
          ${String(sessionId)}, ${String(userId)}, ${String(tokenHash)},
          ${createdAt}, ${expiresAt}, null
        )
        on conflict (id) do update set
          user_id = excluded.user_id,
          token_hash = excluded.token_hash,
          created_at = excluded.created_at,
          expires_at = excluded.expires_at,
          revoked_at = null
        returning *
      `;
      return mapRefreshSessionRow(rows[0]);
    },
    async findById(sessionId) {
      const rows = await sql`
        select *
        from refresh_sessions
        where id = ${String(sessionId)}
          and revoked_at is null
        limit 1
      `;
      return mapRefreshSessionRow(rows[0]);
    },
    async deleteById(sessionId) {
      const rows = await sql`
        update refresh_sessions
        set revoked_at = now()
        where id = ${String(sessionId)}
        returning *
      `;
      return mapRefreshSessionRow(rows[0]);
    },
  };
}

module.exports = {
  createPostgresRefreshSessionRepository,
  mapRefreshSessionRow,
};
