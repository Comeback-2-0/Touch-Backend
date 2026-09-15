const communityRepository = require('../modules/communities/community.repository');
const CommunityContent = require('../modules/communities/community-content.model');
const {publishScheduledCommunityQueues} = require('../modules/communities/community-publication.service');

async function runCommunityPublication() {
  const communities = await communityRepository.listScheduled();
  const published = await publishScheduledCommunityQueues({communities, Content: CommunityContent});
  await Promise.all(published.map(item => communityRepository.markQueuePublished(item.communityId)));
  return published;
}
module.exports = {runCommunityPublication};
