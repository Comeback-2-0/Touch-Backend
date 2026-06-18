const PublicPost = require('../posts/public-post.model');
const Reel = require('../reels/reel.model');

async function exists({ contentId, contentType }) {
  if (contentType === 'post') {
    return Boolean(await PublicPost.exists({ _id: contentId, status: 'active' }));
  }

  if (contentType === 'reel') {
    return Boolean(await Reel.exists({ _id: contentId }));
  }

  return false;
}

module.exports = {
  exists,
};
