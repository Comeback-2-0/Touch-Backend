const neo4j = require('neo4j-driver');
const { getNeo4jDriver } = require('../../database/neo4jClient');

function createSocialGraphRepository({
  driver = getNeo4jDriver(),
  database = process.env.NEO4J_DATABASE,
} = {}) {
  function sessionOptions() {
    return database ? { database } : undefined;
  }

  async function write(cypher, params) {
    const session = driver.session(sessionOptions());
    try {
      return await session.executeWrite(tx => tx.run(cypher, params));
    } finally {
      await session.close();
    }
  }

  async function read(cypher, params) {
    const session = driver.session(sessionOptions());
    try { return await session.executeRead(tx => tx.run(cypher, params)); }
    finally { await session.close(); }
  }

  function relationshipTimestamp() {
    return new Date().toISOString();
  }

  function numericValue(value) {
    return typeof value?.toNumber === 'function' ? value.toNumber() : Number(value || 0);
  }

  return {
    ensureUser({userId, name = '', username = '', profilePicture = '', accountActive, preserveExisting = false}) {
      return write(`
        MERGE (u:User {id: $userId})
        SET u.userId = $userId,
          u.name = CASE WHEN $preserveExisting AND $name = '' THEN coalesce(u.name, '') ELSE $name END,
          u.username = CASE WHEN $preserveExisting AND $username = '' THEN coalesce(u.username, '') ELSE $username END,
          u.profilePicture = CASE WHEN $preserveExisting AND $profilePicture = '' THEN coalesce(u.profilePicture, '') ELSE $profilePicture END,
          u.accountActive = CASE WHEN $preserveExisting AND $accountActive IS NULL THEN coalesce(u.accountActive, true) ELSE coalesce($accountActive, true) END,
          u.updatedAt = datetime($updatedAt)
        RETURN u
      `, {userId: String(userId), name, username, profilePicture, accountActive: accountActive === undefined ? null : Boolean(accountActive), preserveExisting: Boolean(preserveExisting), updatedAt: relationshipTimestamp()});
    },
    deactivateUser({userId}) { return write(`MATCH (u:User {id: $userId}) SET u.accountActive = false, u.updatedAt = datetime($updatedAt) RETURN u`, {userId: String(userId), updatedAt: relationshipTimestamp()}); },
    async getRelationship({viewerId, targetId}) {
      const result = await read(`
        MATCH (a:User {id: $viewerId}), (b:User {id: $targetId})
        OPTIONAL MATCH (a)-[f:FOLLOWS]->(b)
        OPTIONAL MATCH (a)-[q:REQUESTED_TO_FOLLOW]->(b)
          WHERE q.status = 'pending'
        OPTIONAL MATCH (a)-[blocked:BLOCKS]->(b)
        OPTIONAL MATCH (b)-[blockedBy:BLOCKS]->(a)
        OPTIONAL MATCH (a)-[muted:MUTES]->(b)
        RETURN f IS NOT NULL AS following, q IS NOT NULL AS requested,
          blocked IS NOT NULL AS blockedByMe, blockedBy IS NOT NULL AS blockedMe,
          muted IS NOT NULL AS mutedByMe,
          q.requestId AS requestId
      `, {viewerId: String(viewerId), targetId: String(targetId)});
      const row = result.records[0]?.toObject() || {};
      if (row.blockedByMe) return {state: 'blocked_by_me', isBlocked: true};
      if (row.blockedMe) return {state: 'blocked_me', isBlocked: true};
      const mutedByMe = Boolean(row.mutedByMe);
      if (row.following) return {state: 'following', isBlocked: false, mutedByMe};
      return {state: row.requested ? 'requested' : 'none', requestId: row.requestId || null, isBlocked: false, mutedByMe};
    },
    async getProfileStats({userId}) {
      const result = await read(`
        MATCH (u:User {id: $userId})
        OPTIONAL MATCH (follower:User)-[:FOLLOWS]->(u)
          WHERE coalesce(follower.accountActive, false) = true
        WITH u, count(follower) AS followersCount
        OPTIONAL MATCH (u)-[:FOLLOWS]->(following:User)
          WHERE coalesce(following.accountActive, false) = true
        RETURN followersCount, count(following) AS followingCount
      `, {userId: String(userId)});
      if (!result.records.length) return null;
      const row = result.records[0].toObject();
      return {
        followersCount: numericValue(row.followersCount),
        followingCount: numericValue(row.followingCount),
      };
    },
    async blockedUserIds({viewerId, targetIds = []}) {
      const ids = [...new Set(targetIds.map(id => String(id)).filter(Boolean))];
      if (!ids.length) return [];
      const result = await read(`
        MATCH (viewer:User {id: $viewerId})
        UNWIND $targetIds AS targetId
        OPTIONAL MATCH (viewer)-[blocked:BLOCKS]->(target:User {id: targetId})
        OPTIONAL MATCH (target)-[blockedMe:BLOCKS]->(viewer)
        RETURN targetId, blocked IS NOT NULL AS blockedByMe, blockedMe IS NOT NULL AS blockedMe
      `, {viewerId: String(viewerId), targetIds: ids});
      return result.records
        .map(record => record.toObject())
        .filter(row => row.blockedByMe || row.blockedMe)
        .map(row => String(row.targetId));
    },
    async isBlockedPair({firstId, secondId}) {
      const result = await read(`
        MATCH (a:User {id: $firstId}), (b:User {id: $secondId})
        OPTIONAL MATCH (a)-[blocked:BLOCKS]->(b)
        OPTIONAL MATCH (b)-[blockedBy:BLOCKS]->(a)
        RETURN blocked IS NOT NULL OR blockedBy IS NOT NULL AS blocked
      `, {firstId: String(firstId), secondId: String(secondId)});
      const record = result.records[0];
      if (!record) return false;
      if (typeof record.get === 'function') return Boolean(record.get('blocked'));
      return Boolean(record.toObject?.()?.blocked);
    },
    followUser({ followerId, followeeId, notification }) {
      return write(
        `
          MERGE (a:User {id: $followerId})
          MERGE (b:User {id: $followeeId})
          WITH a, b
          WHERE coalesce(a.accountActive, false) = true
            AND coalesce(b.accountActive, false) = true
            AND NOT (a)-[:BLOCKS]->(b) AND NOT (b)-[:BLOCKS]->(a)
          MERGE (a)-[r:FOLLOWS]->(b)
          ON CREATE SET r.createdAt = datetime($createdAt), r.creationEventId = $creationEventId
          SET r.updatedAt = datetime($createdAt)
          WITH a, b, r, ($creationEventId IS NOT NULL AND r.creationEventId = $creationEventId) AS relationshipCreated
          FOREACH (ignored IN CASE WHEN relationshipCreated AND $dedupeKey IS NOT NULL THEN [1] ELSE [] END |
            MERGE (o:SocialNotificationOutbox {dedupeKey: $dedupeKey})
            ON CREATE SET o.id = $outboxId, o.type = $type, o.recipientId = $recipientId,
              o.actorId = $actorId, o.targetType = $targetType, o.targetId = $targetId,
              o.actorName = a.name, o.actorUsername = a.username, o.actorProfilePicture = a.profilePicture,
              o.payload = $payload, o.status = 'pending', o.attempts = 0,
              o.nextAttemptAt = datetime($createdAt), o.createdAt = datetime($createdAt))
          RETURN r
        `,
        {
          followerId: String(followerId),
          followeeId: String(followeeId),
          createdAt: relationshipTimestamp(),
          creationEventId: notification?.id || null,
          dedupeKey: notification?.dedupeKey || null, outboxId: notification?.id || null,
          type: notification?.type || null, recipientId: notification?.recipientId ? String(notification.recipientId) : null,
          actorId: notification?.actorId ? String(notification.actorId) : null, targetType: notification?.targetType || null,
          targetId: notification?.targetId ? String(notification.targetId) : null, payload: JSON.stringify(notification?.payload || {}),
        },
      );
    },
    unfollowUser({ followerId, followeeId }) {
      return write(
        `
          MATCH (:User {id: $followerId})-[r:FOLLOWS]->(:User {id: $followeeId})
          DELETE r
        `,
        {
          followerId: String(followerId),
          followeeId: String(followeeId),
        },
      );
    },
    requestFollow({requesterId, targetId, requestId, notification}) {
      return write(`
        MERGE (a:User {id: $requesterId}) MERGE (b:User {id: $targetId})
        WITH a, b
        WHERE coalesce(a.accountActive, false) = true
          AND coalesce(b.accountActive, false) = true
          AND NOT (a)-[:BLOCKS]->(b) AND NOT (b)-[:BLOCKS]->(a)
        MERGE (a)-[r:REQUESTED_TO_FOLLOW]->(b)
        WITH a, b, r, coalesce(r.status, '') AS previousStatus
        SET r.requestId = CASE WHEN previousStatus = 'pending' AND r.requestId IS NOT NULL THEN r.requestId ELSE $requestId END,
          r.status = 'pending',
          r.createdAt = CASE WHEN previousStatus = 'pending' AND r.createdAt IS NOT NULL THEN r.createdAt ELSE datetime($createdAt) END,
          r.updatedAt = datetime($createdAt),
          r.creationEventId = CASE WHEN previousStatus = 'pending' AND r.creationEventId IS NOT NULL THEN r.creationEventId ELSE $requestId END
        WITH a, b, r, previousStatus <> 'pending' AS relationshipCreated
        FOREACH (ignored IN CASE WHEN relationshipCreated AND $dedupeKey IS NOT NULL THEN [1] ELSE [] END |
          MERGE (o:SocialNotificationOutbox {dedupeKey: $dedupeKey})
          ON CREATE SET o.id = $outboxId, o.type = $type, o.recipientId = $recipientId, o.actorId = $actorId,
            o.targetType = $targetType, o.targetId = $notificationTargetId, o.payload = $payload, o.status = 'pending',
            o.actorName = a.name, o.actorUsername = a.username, o.actorProfilePicture = a.profilePicture,
            o.attempts = 0, o.nextAttemptAt = datetime($createdAt), o.createdAt = datetime($createdAt))
        RETURN r.requestId AS requestId
      `, {requesterId: String(requesterId), targetId: String(targetId), requestId: String(requestId), createdAt: relationshipTimestamp(), dedupeKey: notification?.dedupeKey || null, outboxId: notification?.id || null, type: notification?.type || null, recipientId: notification?.recipientId ? String(notification.recipientId) : null, actorId: notification?.actorId ? String(notification.actorId) : null, targetType: notification?.targetType || null, notificationTargetId: notification?.targetId ? String(notification.targetId) : null, payload: JSON.stringify(notification?.payload || {})});
    },
    acceptFollowRequest({requesterId, targetId, notification}) {
      return write(`
        MATCH (a:User {id: $requesterId})-[q:REQUESTED_TO_FOLLOW]->(b:User {id: $targetId})
        WHERE q.status = 'pending'
          AND coalesce(a.accountActive, false) = true
          AND coalesce(b.accountActive, false) = true
          AND NOT (a)-[:BLOCKS]->(b) AND NOT (b)-[:BLOCKS]->(a)
        SET q.status = 'accepted', q.updatedAt = datetime($createdAt)
        MERGE (a)-[f:FOLLOWS]->(b)
        ON CREATE SET f.createdAt = datetime($createdAt)
        SET f.updatedAt = datetime($createdAt)
        FOREACH (ignored IN CASE WHEN $dedupeKey IS NULL THEN [] ELSE [1] END |
          MERGE (o:SocialNotificationOutbox {dedupeKey: $dedupeKey})
          ON CREATE SET o.id = $outboxId, o.type = $type, o.recipientId = $recipientId, o.actorId = $actorId,
            o.targetType = $targetType, o.targetId = $notificationTargetId,
            o.actorName = b.name, o.actorUsername = b.username, o.actorProfilePicture = b.profilePicture,
            o.payload = $payload, o.status = 'pending',
            o.attempts = 0, o.nextAttemptAt = datetime($createdAt), o.createdAt = datetime($createdAt))
        RETURN f
      `, {requesterId: String(requesterId), targetId: String(targetId), createdAt: relationshipTimestamp(), dedupeKey: notification?.dedupeKey || null, outboxId: notification?.id || null, type: notification?.type || null, recipientId: notification?.recipientId ? String(notification.recipientId) : null, actorId: notification?.actorId ? String(notification.actorId) : null, targetType: notification?.targetType || null, notificationTargetId: notification?.targetId ? String(notification.targetId) : null, payload: JSON.stringify(notification?.payload || {})});
    },
    rejectFollowRequest({requesterId, targetId}) {
      return write(`MATCH (:User {id: $requesterId})-[q:REQUESTED_TO_FOLLOW]->(:User {id: $targetId}) WHERE q.status = 'pending' SET q.status = 'rejected', q.updatedAt = datetime($updatedAt)`, {requesterId: String(requesterId), targetId: String(targetId), updatedAt: relationshipTimestamp()});
    },
    muteUser({muterId, mutedId}) { return write(`MERGE (a:User {id: $muterId}) MERGE (b:User {id: $mutedId}) WITH a, b WHERE coalesce(a.accountActive, false) = true AND coalesce(b.accountActive, false) = true MERGE (a)-[r:MUTES]->(b) ON CREATE SET r.createdAt = datetime($createdAt) SET r.updatedAt = datetime($createdAt) RETURN r`, {muterId: String(muterId), mutedId: String(mutedId), createdAt: relationshipTimestamp()}); },
    unmuteUser({muterId, mutedId}) { return write(`MATCH (:User {id: $muterId})-[r:MUTES]->(:User {id: $mutedId}) DELETE r`, {muterId: String(muterId), mutedId: String(mutedId)}); },
    async findFollowRequest({targetId, requestId}) {
      const result = await read(`
        MATCH (a:User)-[q:REQUESTED_TO_FOLLOW {requestId: $requestId}]->(b:User {id: $targetId})
        WHERE coalesce(a.accountActive, false) = true
          AND coalesce(b.accountActive, false) = true
        RETURN q.requestId AS id, q.status AS status, a.id AS requesterId,
          a.name AS name, a.username AS username, a.profilePicture AS profilePicture
        LIMIT 1
      `, {targetId: String(targetId), requestId: String(requestId)});
      return result.records[0]?.toObject?.() || null;
    },
    async findPendingRequest({targetId, requestId}) {
      const result = await read(`
        MATCH (a:User)-[q:REQUESTED_TO_FOLLOW {requestId: $requestId}]->(b:User {id: $targetId})
        WHERE q.status = 'pending'
          AND coalesce(a.accountActive, false) = true
          AND coalesce(b.accountActive, false) = true
        RETURN q.requestId AS id, a.id AS requesterId, a.name AS name, a.username AS username, a.profilePicture AS profilePicture
        LIMIT 1
      `, {targetId: String(targetId), requestId: String(requestId)});
      return result.records[0]?.toObject?.() || null;
    },
    async listPendingRequests({targetId}) {
      const result = await read(`MATCH (a:User)-[q:REQUESTED_TO_FOLLOW]->(b:User {id: $targetId}) WHERE q.status = 'pending' AND coalesce(a.accountActive, false) = true AND coalesce(b.accountActive, false) = true RETURN q.requestId AS id, a.id AS requesterId, a.name AS name, a.username AS username, a.profilePicture AS profilePicture ORDER BY q.createdAt DESC`, {targetId: String(targetId)});
      return result.records.map(record => record.toObject());
    },
    async listUsers({targetId, direction, limit = 20}) {
      const query = direction === 'followers'
        ? 'MATCH (u:User)-[:FOLLOWS]->(target:User {id: $targetId}) WHERE coalesce(u.accountActive, false) = true RETURN u ORDER BY u.id LIMIT $limit'
        : 'MATCH (target:User {id: $targetId})-[:FOLLOWS]->(u:User) WHERE coalesce(u.accountActive, false) = true RETURN u ORDER BY u.id LIMIT $limit';
      const parsedLimit = Number(limit);
      const safeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 50)
        : 20;
      const result = await read(query, {targetId: String(targetId), limit: neo4j.int(safeLimit)});
      return result.records.map(record => { const user = record.get('u').properties; return {id: user.id, name: user.name || '', username: user.username || '', profilePicture: user.profilePicture || ''}; });
    },
    async listNotificationOutbox(limit = 50) {
      const result = await read(`
        MATCH (o:SocialNotificationOutbox)
        WHERE (o.status = 'pending'
          OR (o.status = 'processing' AND coalesce(o.updatedAt, o.createdAt) <= datetime() - duration({minutes: 5})))
          AND o.nextAttemptAt <= datetime()
        OPTIONAL MATCH (a:User {id: o.actorId})
        RETURN o, a ORDER BY o.createdAt ASC LIMIT $limit
      `, {limit: neo4j.int(Math.min(Number(limit) || 50, 100))});
      return result.records.map(record => {
        const o = record.get('o').properties;
        const a = record.get('a');
        const actor = a ? a.properties : {};
        return {
          id: o.id,
          type: o.type,
          recipient_id: o.recipientId,
          actor_id: o.actorId,
          target_type: o.targetType,
          target_id: o.targetId,
          dedupe_key: o.dedupeKey,
          payload: JSON.parse(o.payload || '{}'),
          status: o.status,
          actor_name: o.actorName || actor.name || '',
          actor_username: o.actorUsername || actor.username || '',
          actor_profile_picture: o.actorProfilePicture || actor.profilePicture || '',
        };
      });
    },
    async claimNotificationOutbox(id) { const result = await write(`MATCH (o:SocialNotificationOutbox {id: $id}) WHERE o.status = 'pending' OR (o.status = 'processing' AND coalesce(o.updatedAt, o.createdAt) <= datetime() - duration({minutes: 5})) SET o.status = 'processing', o.attempts = coalesce(o.attempts, 0) + 1, o.updatedAt = datetime() RETURN o`, {id: String(id)}); return result.records.length ? result.records[0] : null; },
    markNotificationDelivered(id) { return write(`MATCH (o:SocialNotificationOutbox {id: $id}) SET o.status = 'delivered', o.updatedAt = datetime() RETURN o`, {id: String(id)}); },
    markNotificationSuppressed(id) { return write(`MATCH (o:SocialNotificationOutbox {id: $id}) SET o.status = 'suppressed', o.updatedAt = datetime() RETURN o`, {id: String(id)}); },
    markNotificationFailed(id) { return write(`MATCH (o:SocialNotificationOutbox {id: $id}) SET o.status = 'pending', o.nextAttemptAt = datetime() + duration({seconds: 60}), o.updatedAt = datetime() RETURN o`, {id: String(id)}); },
    blockUser({ blockerId, blockedId }) {
      return write(
        `
          MERGE (a:User {id: $blockerId})
          MERGE (b:User {id: $blockedId})
          WITH a, b
          WHERE coalesce(a.accountActive, false) = true
            AND coalesce(b.accountActive, false) = true
          OPTIONAL MATCH (a)-[followOut:FOLLOWS]->(b)
          OPTIONAL MATCH (b)-[followIn:FOLLOWS]->(a)
          OPTIONAL MATCH (a)-[requestOut:REQUESTED_TO_FOLLOW]->(b)
          OPTIONAL MATCH (b)-[requestIn:REQUESTED_TO_FOLLOW]->(a)
          FOREACH (relationship IN [followOut, followIn] | DELETE relationship)
          FOREACH (relationship IN CASE WHEN requestOut IS NULL OR requestOut.status <> 'pending' THEN [] ELSE [requestOut] END |
            SET relationship.status = 'cancelled', relationship.updatedAt = datetime($createdAt))
          FOREACH (relationship IN CASE WHEN requestIn IS NULL OR requestIn.status <> 'pending' THEN [] ELSE [requestIn] END |
            SET relationship.status = 'cancelled', relationship.updatedAt = datetime($createdAt))
          WITH a, b
          OPTIONAL MATCH (o:SocialNotificationOutbox)
          WHERE o.status IN ['pending', 'processing']
            AND ((o.recipientId = a.id AND o.actorId = b.id)
              OR (o.recipientId = b.id AND o.actorId = a.id))
          DELETE o
          MERGE (a)-[r:BLOCKS]->(b)
          ON CREATE SET r.createdAt = datetime($createdAt)
          SET r.updatedAt = datetime($createdAt)
          RETURN r
        `,
        {
          blockerId: String(blockerId),
          blockedId: String(blockedId),
          createdAt: relationshipTimestamp(),
        },
      );
    },
    unblockUser({ blockerId, blockedId }) {
      return write(
        `
          MATCH (:User {id: $blockerId})-[r:BLOCKS]->(:User {id: $blockedId})
          DELETE r
        `,
        {
          blockerId: String(blockerId),
          blockedId: String(blockedId),
        },
      );
    },
    mirrorMembership({ userId, communityId }) {
      return write(
        `
          MERGE (u:User {id: $userId})
          MERGE (c:Community {id: $communityId})
          MERGE (u)-[r:MEMBER_OF]->(c)
          ON CREATE SET r.createdAt = datetime($createdAt)
          SET r.updatedAt = datetime($createdAt)
          RETURN r
        `,
        {
          userId: String(userId),
          communityId: String(communityId),
          createdAt: relationshipTimestamp(),
        },
      );
    },
    removeMembership({ userId, communityId }) {
      return write(
        `
          MATCH (:User {id: $userId})-[r:MEMBER_OF]->(:Community {id: $communityId})
          DELETE r
        `,
        {
          userId: String(userId),
          communityId: String(communityId),
        },
      );
    },
  };
}

module.exports = {
  createSocialGraphRepository,
};
