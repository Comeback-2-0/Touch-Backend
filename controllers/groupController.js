const Group = require('../models/Group');
const Post = require('../models/Post');

exports.getJoinedGroups = async (req, res) => {
  const { userId } = req.params;
  const groups = await Group.find({ members: userId });
  res.json(groups);
};

exports.getTrendingGroups = async (req, res) => {
  const groups = await Group.find().sort({ trendingScore: -1 }).limit(5);
  res.json(groups);
};

exports.searchGroups = async (req, res) => {
  const { query } = req.query;
  const results = await Group.find({ name: { $regex: query, $options: 'i' } });
  res.json(results);
};

exports.joinGroup = async (req, res) => {
  const { groupId } = req.params;
  const { userId } = req.body;

  const group = await Group.findById(groupId);
  if (!group.members.includes(userId)) {
    group.members.push(userId);
    await group.save();
  }
  res.json({ message: 'Joined successfully' });
};