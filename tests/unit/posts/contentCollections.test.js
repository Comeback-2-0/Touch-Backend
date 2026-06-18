const assert = require('node:assert/strict');
const test = require('node:test');

const PublicPost = require('../../../src/modules/posts/public-post.model');
const LegacyPost = require('../../../src/modules/posts/post.model');
const Comment = require('../../../src/modules/comments/comment.model');
const ReelComment = require('../../../src/modules/reels/reel-comment.model');
const Message = require('../../../src/modules/chat/message.model');
const Reel = require('../../../src/modules/reels/reel.model');
const Notification = require('../../../src/modules/notifications/notification.model');

test('Mongo content collections are split by ownership and content type', () => {
  assert.equal(PublicPost.collection.name, 'posts');
  assert.equal(LegacyPost.collection.name, 'community_posts');
  assert.equal(Comment.collection.name, 'comments');
  assert.equal(ReelComment.collection.name, 'reel_comments');
  assert.equal(Message.collection.name, 'messages');
  assert.equal(Reel.collection.name, 'reels');
  assert.equal(Notification.collection.name, 'notifications');
});
