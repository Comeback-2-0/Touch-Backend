const CommunityContent = require('./community-content.model');
const communityRepository = require('./community.repository');
const {
  hoursAgo,
  computeTrendingScore,
  deriveTrendingReason,
  summarizeContentActivity,
} = require('./community-trending.service');

const WINDOW_HOURS = 72;

async function loadContentStats(communityId, since) {
  const posts = await CommunityContent.find({
    communityId: String(communityId),
    $or: [
      {publishedAt: {$gte: since}},
      {createdAt: {$gte: since}},
      {updatedAt: {$gte: since}},
    ],
  })
    .select('state score voters comments reactions moderation publishedAt createdAt updatedAt')
    .lean();
  return summarizeContentActivity(posts, since);
}

async function recomputeCommunityTrending(communityId, {now = new Date()} = {}) {
  const id = String(communityId || '').trim();
  if (!id) return null;

  const community = await communityRepository.findById(id);
  if (!community) return null;

  if (community.suspendedAt) {
    await communityRepository.updateTrending(id, {trendingScore: 0, trendingReason: ''});
    return {communityId: id, trendingScore: 0, trendingReason: ''};
  }

  const since = hoursAgo(WINDOW_HOURS, now);
  const contentStats = await loadContentStats(id, since);
  const joins = await communityRepository.countRecentJoins(id, since);
  const stats = {...contentStats, joins};
  const trendingScore = computeTrendingScore(stats, {now, createdAt: community.createdAt});
  const trendingReason = deriveTrendingReason(stats, {
    now,
    createdAt: community.createdAt,
    score: trendingScore,
  });

  await communityRepository.updateTrending(id, {trendingScore, trendingReason});
  return {communityId: id, trendingScore, trendingReason, stats};
}

async function recomputeAllCommunityTrending({now = new Date()} = {}) {
  const communities = await communityRepository.listAll();
  const results = [];
  for (const community of communities) {
    const result = await recomputeCommunityTrending(community.id || community._id, {now});
    if (result) results.push(result);
  }
  return results;
}

function scheduleCommunityTrendingRecompute(communityId) {
  const id = String(communityId || '').trim();
  if (!id) return;
  setImmediate(() => {
    recomputeCommunityTrending(id).catch(error => {
      console.error('[trending] recompute failed', id, error?.message || error);
    });
  });
}

module.exports = {
  WINDOW_HOURS,
  recomputeCommunityTrending,
  recomputeAllCommunityTrending,
  scheduleCommunityTrendingRecompute,
};
