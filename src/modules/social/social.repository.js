const {v4: uuidv4} = require('uuid');
const {createSocialGraphRepository} = require('../graph/social.repository');
const {createRelationshipCache} = require('./relationship-cache.service');

function graphMutationBlockedError() {
  return Object.assign(new Error('Profile unavailable'), {
    statusCode: 403,
    code: 'RELATIONSHIP_BLOCKED',
  });
}

function assertGraphMutationSucceeded(result) {
  // Neo4j returns an empty result when its in-transaction block guard rejects
  // the mutation. Do not turn that into a successful relationship response.
  if (result?.records && result.records.length === 0) throw graphMutationBlockedError();
  return result;
}

// Neo4j is authoritative for person-to-person graph state and its relationship
// notification outbox. Mongo/push delivery consumes that graph outbox later.
function createSocialRepository({
  graph = createSocialGraphRepository(),
  userRepository,
  relationshipCache,
  redis,
  cacheTtlSeconds,
  metrics,
} = {}) {
  const cache = relationshipCache || createRelationshipCache({redis, ttlSeconds: cacheTtlSeconds, metrics});

  async function ensureUsers(...inputs) {
    for (const input of inputs) {
      const userId = String(typeof input === 'object' ? input.userId : input);
      const suppliedProfile = typeof input === 'object' ? input.profile : null;
      const profile = suppliedProfile || (userRepository?.findById ? await userRepository.findById(userId) : null);
      if (userRepository?.findById && !profile) {
        throw Object.assign(new Error('User profile unavailable'), {
          statusCode: 503,
          code: 'USER_PROFILE_UNAVAILABLE',
        });
      }

      const pendingDeletion = profile?.deletionRequest?.status === 'pending';
      const accountActive = profile?.accountActive !== undefined
        ? Boolean(profile.accountActive) && !pendingDeletion
        : profile?.isProfileComplete !== undefined
          ? Boolean(profile.isProfileComplete) && !pendingDeletion
          : undefined;
      const graphUser = {userId, preserveExisting: true};
      if (profile) {
        graphUser.name = String(profile.name || '');
        graphUser.username = String(profile.username || '');
        graphUser.profilePicture = String(profile.profilePicture || profile.profilePhoto || profile.photo || '');
        graphUser.accountActive = accountActive;
      }
      await graph.ensureUser(graphUser);
    }
  }
  async function invalidatePair(firstId, secondId) {
    await cache.invalidate([
      {viewerId: firstId, targetId: secondId},
      {viewerId: secondId, targetId: firstId},
    ]);
  }
  return {
    async relationship({viewerId, targetId, authoritative = false}) {
      await ensureUsers(viewerId, targetId);
      if (!authoritative) {
        const cached = await cache.get({viewerId, targetId});
        if (cached) return cached;
      }
      const relationship = await graph.getRelationship({viewerId, targetId});
      await cache.set({viewerId, targetId}, relationship);
      return relationship;
    },
    async blockedUserIds({viewerId, targetIds}) {
      await ensureUsers(viewerId);
      return graph.blockedUserIds({viewerId, targetIds});
    },
    async profileStats({userId}) { return graph.getProfileStats?.({userId}) || null; },
    async follow({followerId, followeeId}) {
      await ensureUsers(followerId, followeeId);
      const eventId = uuidv4();
      const result = await graph.followUser({followerId, followeeId, notification: {id: eventId, type: 'follow', recipientId: followeeId, actorId: followerId, targetType: 'profile', targetId: followerId, payload: {targetType: 'profile', targetId: String(followerId)}, dedupeKey: `follow:${followerId}:${followeeId}:${eventId}`}});
      assertGraphMutationSucceeded(result);
      await invalidatePair(followerId, followeeId);
      return {state: 'following'};
    },
    async requestFollow({requesterId, targetId}) {
      await ensureUsers(requesterId, targetId);
      const requestId = uuidv4();
      const result = await graph.requestFollow({requesterId, targetId, requestId, notification: {id: uuidv4(), type: 'follow_request', recipientId: targetId, actorId: requesterId, targetType: 'follow_requests', targetId, payload: {targetType: 'follow_requests', targetId: String(targetId), actorUserId: String(requesterId), requestId}, dedupeKey: `follow_request:${requesterId}:${targetId}:${requestId}`}});
      assertGraphMutationSucceeded(result);
      const existingRequestId = result?.records?.[0]?.get?.('requestId')
        || result?.records?.[0]?.toObject?.()?.requestId
        || requestId;
      await invalidatePair(requesterId, targetId);
      return {state: 'requested', requestId: String(existingRequestId)};
    },
    async unfollow({followerId, followeeId}) { await ensureUsers(followerId, followeeId); await graph.unfollowUser({followerId, followeeId}); await invalidatePair(followerId, followeeId); return {state: 'none'}; },
    async acceptRequest({viewerId, requestId}) {
      if (userRepository?.findById) await ensureUsers(viewerId);
      const request = typeof graph.findFollowRequest === 'function'
        ? await graph.findFollowRequest({targetId: viewerId, requestId})
        : typeof graph.findPendingRequest === 'function'
        ? await graph.findPendingRequest({targetId: viewerId, requestId})
        : (await graph.listPendingRequests({targetId: viewerId})).find(row => String(row.id) === String(requestId));
      if (!request) return {state: 'none'};
      if (request.status && request.status !== 'pending') {
        if (request.status !== 'accepted') return {state: 'none'};
        const current = typeof graph.getRelationship === 'function'
          ? await graph.getRelationship({viewerId, targetId: request.requesterId})
          : null;
        if (current?.isBlocked || ['blocked_by_me', 'blocked_me'].includes(current?.state)) {
          throw graphMutationBlockedError();
        }
        await invalidatePair(request.requesterId, viewerId);
        return {state: current?.state === 'following' || !current ? 'following' : 'none'};
      }
      const result = await graph.acceptFollowRequest({requesterId: request.requesterId, targetId: viewerId, notification: {id: uuidv4(), type: 'follow_accepted', recipientId: request.requesterId, actorId: viewerId, targetType: 'profile', targetId: viewerId, payload: {targetType: 'profile', targetId: String(viewerId)}, dedupeKey: `follow_accepted:${requestId}`}});
      if (result?.records && result.records.length === 0) {
        // Another accept may have won the race after the request lookup. Read
        // the authoritative relationship before deciding whether this was a
        // harmless retry or a block-precedence rejection.
        const current = typeof graph.getRelationship === 'function'
          ? await graph.getRelationship({viewerId, targetId: request.requesterId})
          : null;
        if (current?.isBlocked || ['blocked_by_me', 'blocked_me'].includes(current?.state)) {
          throw graphMutationBlockedError();
        }
        await invalidatePair(request.requesterId, viewerId);
        return {state: current?.state === 'following' ? 'following' : 'none'};
      }
      await invalidatePair(request.requesterId, viewerId);
      return {state: 'following'};
    },
    async rejectRequest({viewerId, requestId}) {
      const request = typeof graph.findPendingRequest === 'function'
        ? await graph.findPendingRequest({targetId: viewerId, requestId})
        : (await graph.listPendingRequests({targetId: viewerId})).find(row => String(row.id) === String(requestId));
      if (request) { await graph.rejectFollowRequest({requesterId: request.requesterId, targetId: viewerId}); await invalidatePair(request.requesterId, viewerId); }
      return {state: 'none'};
    },
    async block({blockerId, blockedId}) { await ensureUsers(blockerId, blockedId); const result = await graph.blockUser({blockerId, blockedId}); assertGraphMutationSucceeded(result); await invalidatePair(blockerId, blockedId); return {state: 'blocked_by_me', isBlocked: true}; },
    async unblock({blockerId, blockedId}) { await graph.unblockUser({blockerId, blockedId}); await invalidatePair(blockerId, blockedId); return {state: 'none'}; },
    async mute({muterId, mutedId}) { await ensureUsers(muterId, mutedId); const result = await graph.muteUser({muterId, mutedId}); assertGraphMutationSucceeded(result); await invalidatePair(muterId, mutedId); return {muted: true}; },
    async unmute({muterId, mutedId}) { await graph.unmuteUser({muterId, mutedId}); await invalidatePair(muterId, mutedId); return {muted: false}; },
    listPendingRequests: ({targetId}) => graph.listPendingRequests({targetId}),
    listUsers: ({targetId, direction, limit}) => graph.listUsers({targetId, direction, limit}),
  };
}

module.exports = {createSocialRepository};
