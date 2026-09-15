function isActiveMembership(membership) {
  return membership?.status === 'active';
}

function canViewCommunityContent(community, membership) {
  if (community?.suspendedAt) return false;
  if (community?.contentVisibility !== 'members') return true;
  return isActiveMembership(membership);
}

function canParticipate(membership) {
  return isActiveMembership(membership) && membership.role !== 'banned';
}

function canManageCommunity(membership) {
  return isActiveMembership(membership) && ['owner', 'moderator'].includes(membership.role);
}

function canOwnCommunity(membership) {
  return isActiveMembership(membership) && membership.role === 'owner';
}

function communityForViewer(community, membership) {
  if (community?.contentVisibility !== 'members' || isActiveMembership(membership)) return community;
  const {rules, queueMode, queueScheduleMinutes, queueSchedule, showLeadership, ...metadata} = community;
  return metadata;
}

module.exports = {
  canManageCommunity,
  canOwnCommunity,
  canParticipate,
  canViewCommunityContent,
  communityForViewer,
  isActiveMembership,
};
