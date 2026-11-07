function httpError(message, statusCode, code) {
  return Object.assign(new Error(message), {statusCode, code});
}

function createSocialService({socialRepository, userRepository}) {
  async function target(targetId) {
    const user = await userRepository.findById(String(targetId));
    if (!user) throw httpError('Profile unavailable', 404, 'PROFILE_NOT_FOUND');
    if (user.deletionRequest?.status === 'pending'
      || user.accountActive === false
      || user.isProfileComplete === false) {
      throw httpError('Profile unavailable', 404, 'PROFILE_NOT_FOUND');
    }
    return user;
  }

  function assertDifferent(viewerId, targetId) {
    if (String(viewerId) === String(targetId)) throw httpError('Cannot perform this action on yourself', 400, 'SELF_ACTION');
  }

  async function assertNotBlocked(viewerId, targetId) {
    const relation = await socialRepository.relationship({viewerId, targetId, authoritative: true});
    if (relation.isBlocked || ['blocked_by_me', 'blocked_me'].includes(relation.state)) {
      throw httpError('Profile unavailable', 403, 'RELATIONSHIP_BLOCKED');
    }
    return relation;
  }

  return {
    async relationship({viewerId, targetId}) {
      await target(targetId);
      return socialRepository.relationship({viewerId, targetId});
    },
    listPendingRequests: ({viewerId}) => socialRepository.listPendingRequests({targetId: viewerId}),
    async follow({viewerId, targetId}) {
      assertDifferent(viewerId, targetId);
      const user = await target(targetId);
      const relation = await assertNotBlocked(viewerId, targetId);
      if (relation.state === 'following') return {state: 'following'};
      if (relation.state === 'requested') return {state: 'requested', requestId: relation.requestId || null};
      if (user.isPrivate) return socialRepository.requestFollow({requesterId: viewerId, targetId});
      return socialRepository.follow({followerId: viewerId, followeeId: targetId});
    },
    async unfollow({viewerId, targetId}) {
      assertDifferent(viewerId, targetId);
      await assertNotBlocked(viewerId, targetId);
      return socialRepository.unfollow({followerId: viewerId, followeeId: targetId});
    },
    async acceptRequest({viewerId, requestId}) { return socialRepository.acceptRequest({viewerId, requestId}); },
    async rejectRequest({viewerId, requestId}) { return socialRepository.rejectRequest({viewerId, requestId}); },
    async block({viewerId, targetId}) { assertDifferent(viewerId, targetId); await target(targetId); return socialRepository.block({blockerId: viewerId, blockedId: targetId}); },
    async unblock({viewerId, targetId}) { assertDifferent(viewerId, targetId); return socialRepository.unblock({blockerId: viewerId, blockedId: targetId}); },
    async mute({viewerId, targetId}) { assertDifferent(viewerId, targetId); await target(targetId); return socialRepository.mute({muterId: viewerId, mutedId: targetId}); },
    async unmute({viewerId, targetId}) { assertDifferent(viewerId, targetId); return socialRepository.unmute({muterId: viewerId, mutedId: targetId}); },
    async listUsers({viewerId, targetId, direction, limit}) {
      const user = await target(targetId);
      if (String(viewerId) !== String(targetId)) {
        const relation = await socialRepository.relationship({viewerId, targetId, authoritative: true});
        if (relation.isBlocked || relation.state === 'blocked_me') throw httpError('Profile unavailable', 403, 'RELATIONSHIP_BLOCKED');
        if (user.isPrivate && relation.state !== 'following') throw httpError('Profile unavailable', 403, 'PRIVATE_PROFILE');
      }
      const users = await socialRepository.listUsers({targetId, direction, limit});
      if (!socialRepository.blockedUserIds || !users.length) return users;
      const blockedIds = new Set(await socialRepository.blockedUserIds({
        viewerId: String(viewerId),
        targetIds: users.map(user => user.id),
      }));
      return users.filter(user => !blockedIds.has(String(user.id)));
    },
  };
}

module.exports = {createSocialService, httpError};
