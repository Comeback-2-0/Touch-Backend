const {getPostgresClient} = require('../../database/postgresClient');

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, character => `\\${character}`);
}

function mapSearchRow(row) {
  return {
    userId: String(row.id),
    username: String(row.username || ''),
    name: String(row.name || ''),
    profilePhoto: String(row.profile_picture || row.photo || ''),
    updatedAt: toIso(row.updated_at),
  };
}

function boundedDatabaseTimeout(value, fallback = 750) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(5000, Math.max(100, Math.floor(parsed)));
}

/**
 * PostgreSQL is the authoritative user source and the availability fallback
 * for People Search. The query is bounded and relies on the Stage 1 lower(text)
 * prefix indexes; it never loads the user table into application memory.
 */
function createPostgresSearchRepository(
  sql = getPostgresClient(),
  {timeoutMs = boundedDatabaseTimeout(process.env.SEARCH_DATABASE_TIMEOUT_MS)} = {},
) {
  return {
    authoritative: true,

    // Kept as a small reusable projection filter for injected/non-authoritative
    // repositories and for defensive checks on rows returned by a future read
    // replica. The primary search query already applies the same predicates.
    async activeUserIds(userIds = []) {
      const ids = [...new Set(userIds.map(id => String(id)).filter(Boolean))];
      if (!ids.length) return [];
      const rows = await sql`
        select id
        from users
        where id = any(${sql.array(ids, 'text')})
          and is_profile_complete = true
          and coalesce(deletion_request->>'status', '') <> 'pending'
      `;
      return rows.map(row => String(row.id));
    },

    async searchPeople({query, viewerId, limit = 20, offset = 0}) {
      const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 20));
      const safeOffset = Math.max(0, Number.isInteger(offset) ? offset : 0);
      const normalized = String(query || '').toLowerCase();
      const prefix = `${escapeLike(normalized)}%`;

      const runQuery = async querySql => querySql`
        select id, username, name, profile_picture, photo, updated_at,
          case
            when lower(username) = ${normalized} then 0
            when lower(username) like ${prefix} escape '\\' then 1
            when lower(name) = ${normalized} then 2
            else 3
          end as match_rank
        from users
        where is_profile_complete = true
          and coalesce(deletion_request->>'status', '') <> 'pending'
          and id <> ${String(viewerId)}
          and (
            lower(username) = ${normalized}
            or lower(username) like ${prefix} escape '\\'
            or lower(name) = ${normalized}
            or lower(name) like ${prefix} escape '\\'
          )
        order by match_rank asc, lower(username) asc, lower(name) asc, id asc
        limit ${safeLimit + 1}
        offset ${safeOffset}
      `;

      const rows = typeof sql.begin === 'function'
        ? await sql.begin(async transactionSql => {
          await transactionSql`select set_config('statement_timeout', ${String(boundedDatabaseTimeout(timeoutMs))}, true)`;
          return runQuery(transactionSql);
        })
        : await runQuery(sql);

      const hasMore = rows.length > safeLimit;
      return {
        items: rows.slice(0, safeLimit).map(mapSearchRow),
        nextOffset: hasMore ? safeOffset + safeLimit : null,
      };
    },
  };
}

module.exports = {createPostgresSearchRepository, mapSearchRow, boundedDatabaseTimeout};
