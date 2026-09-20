const {
  recomputeAllCommunityTrending,
} = require('../modules/communities/community-trending');

async function runCommunityTrending() {
  return recomputeAllCommunityTrending();
}

module.exports = {runCommunityTrending};
