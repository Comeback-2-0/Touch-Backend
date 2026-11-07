function httpError(message, statusCode, code) {
  return Object.assign(new Error(message), {statusCode, code});
}

function createPublicProfileService({userRepository, socialRepository}) {
  return {
    async getProfile({viewerId, targetId}) {
      const user = await userRepository.findById(String(targetId));
      if (!user) throw httpError('Profile unavailable', 404, 'PROFILE_NOT_FOUND');
      if (user.deletionRequest?.status === 'pending'
        || user.accountActive === false
        || user.isProfileComplete === false) {
        throw httpError('Profile unavailable', 404, 'PROFILE_NOT_FOUND');
      }
      const relationship = await socialRepository.relationship({viewerId, targetId, authoritative: true});
      if (relationship.state === 'blocked_me') throw httpError('Profile unavailable', 403, 'PROFILE_BLOCKED');
      if (relationship.state === 'blocked_by_me') {
        return {
          id: String(user.id || user._id),
          name: '',
          username: '',
          bio: '',
          profilePicture: '',
          isPrivate: true,
          relationship,
          postsVisible: false,
          canViewLists: false,
          isMuted: false,
        };
      }
      const isOwner = String(viewerId) === String(targetId);
      const approved = isOwner || relationship.state === 'following';
      const postsVisible = isOwner || !user.isPrivate || approved;
      const result = {
        id: String(user.id || user._id),
        name: user.name || '',
        username: user.username || '',
        bio: user.bio || '',
        profilePicture: user.profilePicture || user.photo || '',
        isPrivate: Boolean(user.isPrivate),
        relationship,
        postsVisible,
        canViewLists: isOwner || !user.isPrivate || approved,
        isMuted: Boolean(relationship.mutedByMe),
      };
      if (isOwner) {
        const graphStats = typeof socialRepository.profileStats === 'function'
          ? await socialRepository.profileStats({userId: targetId})
          : null;
        result.followersCount = Number(graphStats?.followersCount ?? user.followersCount ?? 0);
        result.followingCount = Number(graphStats?.followingCount ?? user.followingCount ?? 0);
        result.postsCount = Number(user.postsCount || 0);
      }
      return result;
    },
  };
}

module.exports = {createPublicProfileService};
