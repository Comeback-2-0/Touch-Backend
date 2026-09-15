const assert = require('node:assert/strict');
const test = require('node:test');

const {
  validateCommunityContent,
  MAX_COMMUNITY_VIDEO_BYTES,
  validateUploadedCommunityMedia,
  applyQueueVote,
} = require('../../../src/modules/communities/community-content.service');

test('allows text with one image attachment', () => {
  assert.doesNotThrow(() => validateCommunityContent({
    text: 'A thought for the queue',
    files: [{mimetype: 'image/jpeg', size: 1024}],
  }));
});

test('rejects more than one attachment', () => {
  assert.throws(() => validateCommunityContent({
    files: [
      {mimetype: 'image/jpeg', size: 1024},
      {mimetype: 'image/png', size: 1024},
    ],
  }), /one media item/i);
});

test('rejects videos larger than the community limit', () => {
  assert.throws(() => validateCommunityContent({
    files: [{mimetype: 'video/mp4', size: MAX_COMMUNITY_VIDEO_BYTES + 1}],
  }), /25 MB/i);
});

test('rejects uploaded videos longer than thirty seconds', () => {
  assert.throws(() => validateUploadedCommunityMedia({duration: 30.1}, 'video/mp4'), /30 seconds/i);
  assert.doesNotThrow(() => validateUploadedCommunityMedia({duration: 30}, 'video/mp4'));
});

test('first upvote sets score to 1 and records the voter', () => {
  const post = {score: 0, voters: []};
  applyQueueVote(post, 'user-1', 1);
  assert.equal(post.score, 1);
  assert.deepEqual(post.voters, [{userId: 'user-1', value: 1}]);
});

test('repeat upvote from same user does not stack the score', () => {
  const post = {score: 1, voters: [{userId: 'user-1', value: 1}]};
  applyQueueVote(post, 'user-1', 1);
  assert.equal(post.score, 1);
  assert.equal(post.voters.length, 1);
});

test('switching upvote to downvote adjusts score by two', () => {
  const post = {score: 1, voters: [{userId: 'user-1', value: 1}]};
  applyQueueVote(post, 'user-1', -1);
  assert.equal(post.score, -1);
  assert.equal(post.voters[0].value, -1);
});

const {applyCommentEngagement, sortCommentsLikeLegacy, sortRepliesOldestFirst} = require('../../../src/modules/communities/community-content.service');

test('comment like toggles and clears an existing dislike', () => {
  const comment = {likes: 0, dislikes: 1, likedBy: [], dislikedBy: ['user-1'], reportedBy: []};
  applyCommentEngagement(comment, 'user-1', 'like');
  assert.equal(comment.likes, 1);
  assert.equal(comment.dislikes, 0);
  assert.deepEqual(comment.likedBy, ['user-1']);
  assert.deepEqual(comment.dislikedBy, []);
  applyCommentEngagement(comment, 'user-1', 'like');
  assert.equal(comment.likes, 0);
  assert.deepEqual(comment.likedBy, []);
});

test('comment report is append-only per user', () => {
  const comment = {likes: 0, dislikes: 0, likedBy: [], dislikedBy: [], reportedBy: []};
  applyCommentEngagement(comment, 'user-1', 'report');
  applyCommentEngagement(comment, 'user-1', 'report');
  assert.deepEqual(comment.reportedBy, ['user-1']);
});

test('comments sort by likes then reply count like legacy', () => {
  const sorted = sortCommentsLikeLegacy([
    {id: 'a', likes: 1, replies: [{}, {}]},
    {id: 'b', likes: 3, replies: []},
    {id: 'c', likes: 1, replies: [{}]},
  ]);
  assert.deepEqual(sorted.map(item => item.id), ['b', 'a', 'c']);
});

test('replies sort oldest first like legacy', () => {
  const sorted = sortRepliesOldestFirst([
    {id: 'new', createdAt: new Date('2026-09-02')},
    {id: 'old', createdAt: new Date('2026-09-01')},
  ]);
  assert.deepEqual(sorted.map(item => item.id), ['old', 'new']);
});
