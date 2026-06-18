const Group = require('./group.model');

function listAll() {
  return Group.find().sort({ name: 1 });
}

function findById(communityId) {
  return Group.findById(communityId);
}

function listTrending(limit = 5) {
  return Group.find().sort({ trendingScore: -1 }).limit(limit);
}

function search(query) {
  return Group.find({ name: { $regex: query || '', $options: 'i' } });
}

function listJoined(userId) {
  return Group.find({ members: String(userId) });
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

module.exports = {
  listAll,
  findById,
  listTrending,
  search,
  listJoined,
  joinCommunity,
};
