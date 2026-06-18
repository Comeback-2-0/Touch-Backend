const communityRepository = require('./community.repository');
const { createSocialGraphRepository } = require('../graph/social.repository');

let socialGraphRepository;

function getSocialGraphRepository() {
  if (!socialGraphRepository) {
    socialGraphRepository = createSocialGraphRepository();
  }
  return socialGraphRepository;
}

exports.getJoinedGroups = async (req, res) => {
  const userId = req.user?.id || req.params.userId;
  const groups = await communityRepository.listJoined(userId);
  res.json(groups);
};

exports.getTrendingGroups = async (req, res) => {
  const groups = await communityRepository.listTrending(5);
  res.json(groups);
};

exports.searchGroups = async (req, res) => {
  const { query } = req.query;
  const results = await communityRepository.search(query);
  res.json(results);
};

exports.joinGroup = async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user.id;

  const group = await communityRepository.findById(groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const joined = await communityRepository.joinCommunity({
    userId,
    communityId: groupId,
  });

  try {
    await getSocialGraphRepository().mirrorMembership({
      userId,
      communityId: groupId,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Failed to mirror community membership to Neo4j:', err);
    }
  }
  res.json({ message: 'Joined successfully', group: joined || group });
};
