const Group = require('./group.model');

function listAll() {
  return Group.find().sort({ name: 1 });
}

function findById(communityId) {
  return Group.findById(communityId);
}

async function create({name, description = '', image = '', createdBy}) {
  return Group.create({name, description, image, members: [String(createdBy)], trendingScore: 0});
}
async function update(communityId, input) { return Group.findByIdAndUpdate(communityId, {$set: input}, {new: true}); }

function listTrending(limit = 5) {
  return Group.find().sort({ trendingScore: -1 }).limit(limit);
}
async function listScheduled() { return []; }
async function markQueuePublished() { return null; }
async function setSuspension() { return null; }

function search(query) {
  return Group.find({ name: { $regex: query || '', $options: 'i' } });
}

function listJoined(userId) {
  return Group.find({ members: String(userId) });
}

async function getMembership(userId, communityId) {
  const group = await Group.findOne({_id: communityId, members: String(userId)});
  return group ? {userId: String(userId), communityId: String(communityId), role: 'member', status: 'active'} : null;
}

async function joinCommunity({ userId, communityId }) {
  const group = await Group.findById(communityId);
  if (!group) return null;
  if (!group.members.includes(String(userId))) {
    group.members.push(String(userId));
    await group.save();
  }
  return group;
}

async function requestJoin({userId, communityId, alias = '', note = '', revealUsername = false, revealedUsername = ''}) {
  return {
    id: `${communityId}:${userId}`,
    communityId,
    alias,
    note,
    revealUsername: Boolean(revealUsername),
    revealedUsername: revealedUsername || '',
    status: 'pending',
  };
}
async function getJoinRequest() { return null; }
async function cancelJoinRequest() { return false; }
async function countPendingJoinRequests() { return 0; }
async function listJoinRequests() { return []; }
async function reviewJoinRequest() { return null; }
async function createInvite() { return null; }
async function acceptInvite({userId, communityId}) { return joinCommunity({userId, communityId}); }
async function revokeInvite() { return false; }

async function leaveCommunity({userId, communityId}) {
  const group = await Group.findByIdAndUpdate(communityId, {$pull: {members: String(userId)}}, {new: true});
  return group;
}

async function setCommunityNotificationMute({userId, communityId, muted}) {
  const member = await getMembership(userId, communityId);
  return member ? {...member, status: muted ? 'muted' : 'active'} : null;
}

async function updateMembershipRole() { return null; }
async function audit() { return null; }
async function listAudit() { return []; }
async function requestOwnershipTransfer() { return null; }
async function acceptOwnershipTransfer() { return null; }

module.exports = {
  listAll,
  findById,
  create,
  update,
  listTrending,
  listScheduled,
  markQueuePublished,
  setSuspension,
  search,
  listJoined,
  getMembership,
  joinCommunity,
  requestJoin,
  getJoinRequest,
  cancelJoinRequest,
  countPendingJoinRequests,
  listJoinRequests,
  reviewJoinRequest,
  createInvite,
  acceptInvite,
  revokeInvite,
  leaveCommunity,
  setCommunityNotificationMute,
  updateMembershipRole,
  audit,
  listAudit,
  requestOwnershipTransfer,
  acceptOwnershipTransfer,
};
