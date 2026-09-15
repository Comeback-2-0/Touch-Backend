const { v4: uuidv4 } = require('uuid');
const { getPostgresClient } = require('../../database/postgresClient');
const {hashInviteToken} = require('./community-invite.service');
const {mapJoinRequestRow} = require('./community-join-request.service');

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
    rules: row.rules || '',
    contentVisibility: row.content_visibility === 'members' ? 'members' : 'public',
    joinMode: row.join_mode || 'open',
    showLeadership: Boolean(row.show_leadership),
    queueMode: row.queue_mode || 'manual',
    queueScheduleMinutes: row.queue_schedule_minutes || null,
    queueSchedule: row.queue_schedule || null,
    lastQueuePublishedAt: toIso(row.last_queue_published_at),
    suspendedAt: toIso(row.suspended_at),
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
    async listScheduled() {
      const rows = await sql`
        select * from communities
        where queue_mode = 'scheduled'
          and (queue_schedule is not null or queue_schedule_minutes is not null)
      `;
      return mapRows(rows);
    },
    async markQueuePublished(communityId, at = new Date()) {
      await sql`update communities set last_queue_published_at = ${at}, updated_at = now() where id = ${String(communityId)}`;
    },
    async setSuspension(communityId, suspended) {
      const rows = await sql`update communities set suspended_at = ${suspended ? new Date() : null}, updated_at = now() where id = ${String(communityId)} returning *`;
      return mapCommunityRow(rows[0]);
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
    async getMembership(userId, communityId) {
      const rows = await sql`
        select user_id, community_id, role, status, joined_at, updated_at
        from community_memberships
        where user_id = ${String(userId)} and community_id = ${String(communityId)}
        limit 1
      `;
      const row = rows[0];
      if (!row) return null;
      return {
        userId: row.user_id,
        communityId: row.community_id,
        role: row.role,
        status: row.status,
        joinedAt: toIso(row.joined_at),
        updatedAt: toIso(row.updated_at),
      };
    },
    async create(input) {
      const id = input.id || uuidv4();
      const scheduleJson = input.queueSchedule ? sql.json(input.queueSchedule) : null;
      const rows = await sql`
        insert into communities (
          id, name, description, image, created_by, rules, content_visibility,
          join_mode, show_leadership, queue_mode, queue_schedule_minutes, queue_schedule, members_count
        )
        values (
          ${id}, ${input.name || ''}, ${input.description || ''},
          ${input.image || ''}, ${input.createdBy || null}, ${input.rules || ''},
          ${input.contentVisibility || 'public'}, ${input.joinMode || 'open'},
          ${Boolean(input.showLeadership)}, ${input.queueMode || 'manual'},
          ${input.queueScheduleMinutes || null}, ${scheduleJson}, 1
        )
        returning *
      `;
      await sql`
        insert into community_memberships (user_id, community_id, role, status)
        values (${String(input.createdBy)}, ${id}, 'owner', 'active')
      `;
      return mapCommunityRow(rows[0]);
    },
    async update(communityId, input) {
      const scheduleJson = input.queueSchedule ? sql.json(input.queueSchedule) : null;
      const rows = await sql`
        update communities set name = ${input.name || ''}, description = ${input.description || ''}, image = ${input.image || ''}, rules = ${input.rules || ''},
          content_visibility = ${input.contentVisibility || 'public'}, join_mode = ${input.joinMode || 'open'}, show_leadership = ${Boolean(input.showLeadership)},
          queue_mode = ${input.queueMode || 'manual'}, queue_schedule_minutes = ${input.queueScheduleMinutes || null},
          queue_schedule = ${scheduleJson}, updated_at = now()
        where id = ${String(communityId)} returning *
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
    async requestJoin({userId, communityId, alias = '', note = '', revealUsername = false, revealedUsername = ''}) {
      const id = uuidv4();
      const rows = await sql`
        insert into community_join_requests (
          id, community_id, user_id, alias, note, status, reveal_username, revealed_username
        )
        values (
          ${id}, ${String(communityId)}, ${String(userId)}, ${String(alias || '')}, ${String(note)}, 'pending',
          ${Boolean(revealUsername)}, ${String(revealedUsername || '')}
        )
        on conflict (community_id, user_id) do update set
          alias = excluded.alias,
          note = excluded.note,
          reveal_username = excluded.reveal_username,
          revealed_username = excluded.revealed_username,
          status = 'pending',
          reviewed_by = null,
          updated_at = now()
        returning *
      `;
      return mapJoinRequestRow(rows[0]);
    },
    async getJoinRequest({userId, communityId}) {
      const rows = await sql`
        select id, community_id, alias, note, status, reveal_username, revealed_username, created_at, updated_at
        from community_join_requests
        where community_id = ${String(communityId)} and user_id = ${String(userId)}
        limit 1
      `;
      return mapJoinRequestRow(rows[0]);
    },
    async cancelJoinRequest({userId, communityId}) {
      const rows = await sql`
        delete from community_join_requests
        where community_id = ${String(communityId)}
          and user_id = ${String(userId)}
          and status = 'pending'
        returning id
      `;
      return Boolean(rows[0]);
    },
    async countPendingJoinRequests(communityId) {
      const rows = await sql`
        select count(*)::int as count
        from community_join_requests
        where community_id = ${String(communityId)} and status = 'pending'
      `;
      return Number(rows[0]?.count || 0);
    },
    async listJoinRequests(communityId) {
      const rows = await sql`
        select id, community_id, alias, note, status, reveal_username, revealed_username, created_at, updated_at
        from community_join_requests
        where community_id = ${String(communityId)} and status = 'pending'
        order by created_at asc
      `;
      return rows.map(mapJoinRequestRow);
    },
    async reviewJoinRequest({requestId, reviewerId, decision}) {
      const rows = await sql`
        update community_join_requests set status = ${String(decision)}, reviewed_by = ${String(reviewerId)}, updated_at = now()
        where id = ${String(requestId)} and status = 'pending'
        returning *
      `;
      const request = rows[0];
      if (!request) return null;
      if (decision === 'approved') {
        await sql`
          insert into community_memberships (user_id, community_id, role, status)
          values (${String(request.user_id)}, ${String(request.community_id)}, 'member', 'active')
          on conflict (user_id, community_id) do update set status = 'active', updated_at = now()
        `;
        await sql`
          update communities set members_count = (select count(*) from community_memberships where community_id = ${String(request.community_id)} and status = 'active'), updated_at = now()
          where id = ${String(request.community_id)}
        `;
      }
      return {id: request.id, communityId: request.community_id, alias: request.alias, status: request.status};
    },
    async createInvite({communityId, createdBy, token, expiresAt = null, maxUses = null}) {
      const rows = await sql`
        insert into community_invite_links (id, community_id, token_hash, created_by, expires_at, max_uses)
        values (${uuidv4()}, ${String(communityId)}, ${hashInviteToken(token)}, ${String(createdBy)}, ${expiresAt}, ${maxUses})
        returning id, community_id, expires_at, max_uses, uses_count, created_at
      `;
      const row = rows[0];
      return {id: row.id, communityId: row.community_id, expiresAt: toIso(row.expires_at), maxUses: row.max_uses, usesCount: Number(row.uses_count || 0), createdAt: toIso(row.created_at)};
    },
    async acceptInvite({communityId, userId, token}) {
      const rows = await sql`
        update community_invite_links set uses_count = uses_count + 1
        where community_id = ${String(communityId)} and token_hash = ${hashInviteToken(token)} and revoked_at is null
          and (expires_at is null or expires_at > now()) and (max_uses is null or uses_count < max_uses)
        returning id
      `;
      if (!rows[0]) return null;
      return this.joinCommunity({userId, communityId});
    },
    async revokeInvite({communityId, inviteId}) {
      const rows = await sql`
        update community_invite_links set revoked_at = now()
        where id = ${String(inviteId)} and community_id = ${String(communityId)} and revoked_at is null
        returning id
      `;
      return Boolean(rows[0]);
    },
    async leaveCommunity({userId, communityId}) {
      await sql`
        update community_memberships set status = 'left', updated_at = now()
        where user_id = ${String(userId)} and community_id = ${String(communityId)} and role <> 'owner'
      `;
      const rows = await sql`
        update communities set members_count = (select count(*) from community_memberships where community_id = ${String(communityId)} and status = 'active'), updated_at = now()
        where id = ${String(communityId)} returning *
      `;
      return mapCommunityRow(rows[0]);
    },
    async setCommunityNotificationMute({userId, communityId, muted}) {
      const rows = await sql`
        insert into community_notification_preferences (user_id, community_id, muted)
        values (${String(userId)}, ${String(communityId)}, ${Boolean(muted)})
        on conflict (user_id, community_id) do update set muted = excluded.muted, updated_at = now()
        returning *
      `;
      const row = rows[0];
      return row ? {userId: row.user_id, communityId: row.community_id, muted: Boolean(row.muted)} : null;
    },
    async updateMembershipRole({userId, communityId, role}) {
      const rows = await sql`
        update community_memberships set role = ${String(role)}, updated_at = now()
        where user_id = ${String(userId)} and community_id = ${String(communityId)} and status = 'active'
        returning *
      `;
      return rows[0] || null;
    },
    async audit({communityId, actorId, action, targetType = '', targetId = '', metadata = {}}) {
      await sql`
        insert into community_audit_events (id, community_id, actor_id, action, target_type, target_id, metadata)
        values (${uuidv4()}, ${String(communityId)}, ${String(actorId)}, ${String(action)}, ${String(targetType)}, ${String(targetId)}, ${metadata})
      `;
    },
    async listAudit(communityId) {
      const rows = await sql`
        select id, action, target_type, target_id, metadata, created_at
        from community_audit_events where community_id = ${String(communityId)}
        order by created_at desc limit 200
      `;
      return rows.map(row => ({id: row.id, action: row.action, targetType: row.target_type, targetId: row.target_id, metadata: row.metadata || {}, createdAt: toIso(row.created_at)}));
    },
    async requestOwnershipTransfer({communityId, fromUserId, toUserId}) {
      const id = uuidv4();
      const rows = await sql`
        insert into community_ownership_transfers (id, community_id, from_user_id, to_user_id, status)
        values (${id}, ${String(communityId)}, ${String(fromUserId)}, ${String(toUserId)}, 'pending')
        returning *
      `;
      return rows[0];
    },
    async acceptOwnershipTransfer({transferId, userId}) {
      const accept = async tx => {
        const rows = await tx`
          update community_ownership_transfers set status = 'accepted', accepted_at = now()
          where id = ${String(transferId)} and to_user_id = ${String(userId)} and status = 'pending'
          and exists (select 1 from community_memberships where community_id = community_ownership_transfers.community_id and user_id = ${String(userId)} and status = 'active')
          returning *
        `;
        const transfer = rows[0];
        if (!transfer) return null;
        await tx`
          update community_memberships set role = case
            when user_id = ${String(transfer.to_user_id)} then 'owner'
            when user_id = ${String(transfer.from_user_id)} then 'moderator'
            else role end, updated_at = now()
          where community_id = ${String(transfer.community_id)}
            and user_id in (${String(transfer.from_user_id)}, ${String(transfer.to_user_id)})
        `;
        return transfer;
      };
      return typeof sql.begin === 'function' ? sql.begin(accept) : accept(sql);
    },
  };
}

module.exports = {
  createPostgresCommunityRepository,
  mapCommunityRow,
};
