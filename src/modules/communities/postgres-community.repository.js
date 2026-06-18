const { v4: uuidv4 } = require('uuid');
const { getPostgresClient } = require('../../database/postgresClient');

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapCommunityRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    _id: row.id,
    name: row.name || '',
    description: row.description || '',
    image: row.image || '',
    membersCount: Number(row.members_count || 0),
    trendingScore: Number(row.trending_score || 0),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function createPostgresCommunityRepository(sql = getPostgresClient()) {
  function mapRows(rows) {
    return rows.map(mapCommunityRow);
  }

  return {
    async findById(communityId) {
      const rows = await sql`
        select * from communities
        where id = ${String(communityId)}
        limit 1
      `;
      return mapCommunityRow(rows[0]);
    },
    async listAll() {
      const rows = await sql`
        select * from communities
        order by name asc
      `;
      return mapRows(rows);
    },
    async listTrending(limit = 5) {
      const rows = await sql`
        select * from communities
        order by trending_score desc, members_count desc, created_at desc
        limit ${Number(limit)}
      `;
      return mapRows(rows);
    },
    async search(query) {
      const rows = await sql`
        select * from communities
        where name ilike ${`%${query || ''}%`}
        order by members_count desc, name asc
        limit 25
      `;
      return mapRows(rows);
    },
    async listJoined(userId) {
      const rows = await sql`
        select c.*
        from communities c
        join community_memberships cm on cm.community_id = c.id
        where cm.user_id = ${String(userId)}
          and cm.status = 'active'
        order by cm.joined_at desc
      `;
      return mapRows(rows);
    },
    async create(input) {
      const id = input.id || uuidv4();
      const rows = await sql`
        insert into communities (
          id, name, description, image, created_by
        )
        values (
          ${id}, ${input.name || ''}, ${input.description || ''},
          ${input.image || ''}, ${input.createdBy || null}
        )
        returning *
      `;
      return mapCommunityRow(rows[0]);
    },
    async joinCommunity({ userId, communityId }) {
      await sql`
        insert into community_memberships (
          user_id, community_id, role, status
        )
        values (
          ${String(userId)}, ${String(communityId)}, 'member', 'active'
        )
        on conflict (user_id, community_id) do update set
          status = 'active',
          updated_at = now()
      `;

      const rows = await sql`
        update communities
        set
          members_count = (
            select count(*)
            from community_memberships
            where community_id = ${String(communityId)}
              and status = 'active'
          ),
          updated_at = now()
        where id = ${String(communityId)}
        returning *
      `;
      return mapCommunityRow(rows[0]);
    },
  };
}

module.exports = {
  createPostgresCommunityRepository,
  mapCommunityRow,
};
