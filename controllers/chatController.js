// controllers/chatController.js

const Group = require('../models/Group');

/**
 * Get groups a user is enrolled in by their Firebase UID
 */
const getUserGroups = async (req, res) => {
  const { uid } = req.body;

  if (!uid) {
    return res.status(400).json({ message: 'Missing UID in request body' });
  }

  try {
    const groups = await Group.find({ members: uid }).select('groupId groupName');

    if (groups.length === 0) {
      return res.status(404).json({ message: 'No groups found for this user' });
    }

    return res.status(200).json({
      message: 'Groups fetched successfully',
      groups,
    });
  } catch (error) {
    console.error('❌ Error fetching user groups:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getUserGroups,
};
