const assert = require('node:assert/strict');
const test = require('node:test');

const {
  validateCommunityContent,
  MAX_COMMUNITY_VIDEO_BYTES,
  validateUploadedCommunityMedia,
  applyQueueVote,
  applyCommentEngagement,
  applyPostReaction,
  countThreadComments,
  resolvePostCommentAlias,
  sortCommentsByTime,
  sortCommentsLikeLegacy,
  sortRepliesOldestFirst,
  sortQueuePosts,
  resetQueueVotes,
  MAX_COMMENT_TEXT,
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

test('repeat upvote from same user does not undo or stack', () => {
  const post = {score: 1, voters: [{userId: 'user-1', value: 1}]};
  applyQueueVote(post, 'user-1', 1);
  assert.equal(post.score, 1);
  assert.equal(post.voters.length, 1);
  assert.equal(post.voters[0].value, 1);
});

test('queue sorts by upvotes then fewer downvotes', () => {
  const ordered = sortQueuePosts([
    {id: 'b', voters: [{value: 1}, {value: -1}, {value: -1}], createdAt: '2026-01-01'},
    {id: 'a', voters: [{value: 1}, {value: 1}], createdAt: '2026-01-02'},
    {id: 'c', voters: [{value: 1}, {value: 1}, {value: -1}], createdAt: '2026-01-03'},
  ]);
  assert.deepEqual(ordered.map(item => item.id), ['a', 'c', 'b']);
});

test('publishing clears queue vote tallies', () => {
  const post = {score: 4, voters: [{userId: 'a', value: 1}, {userId: 'b', value: -1}]};
  resetQueueVotes(post);
  assert.equal(post.score, 0);
  assert.deepEqual(post.voters, []);
});

test('switching upvote to downvote adjusts score by two', () => {
  const post = {score: 1, voters: [{userId: 'user-1', value: 1}]};
  applyQueueVote(post, 'user-1', -1);
  assert.equal(post.score, -1);
  assert.equal(post.voters[0].value, -1);
});

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

test('comments sort oldest first by default so likes do not reshuffle the thread', () => {
  const sorted = sortCommentsByTime([
    {id: 'new', likes: 9, createdAt: new Date('2026-09-02')},
    {id: 'old', likes: 0, createdAt: new Date('2026-09-01')},
  ]);
  assert.deepEqual(sorted.map(item => item.id), ['old', 'new']);
});

test('thread count includes nested replies', () => {
  assert.equal(countThreadComments([
    {replies: [{}, {}]},
    {replies: []},
  ]), 4);
});

test('comment text limit is 500 characters', () => {
  assert.equal(MAX_COMMENT_TEXT, 500);
});

test('a viewer reuses the same alias on a post', () => {
  const post = {
    alias: 'anon-post',
    comments: [
      {authorId: 'user-1', alias: 'anon-21d6b0', replies: []},
      {authorId: 'user-2', alias: 'anon-other', replies: [{authorId: 'user-1', alias: 'anon-21d6b0'}]},
    ],
  };
  assert.equal(resolvePostCommentAlias(post, 'user-1'), 'anon-21d6b0');
});

test('a custom alias is rejected when another voice on the post already uses it', () => {
  const post = {
    alias: 'anon-post',
    comments: [{authorId: 'user-2', alias: 'Sky', replies: []}],
  };
  assert.throws(() => resolvePostCommentAlias(post, 'user-1', 'sky'), /already used/i);
});

test('a viewer may keep or rename their own alias even if it already appears on their comments', () => {
  const post = {
    alias: 'anon-post',
    comments: [{authorId: 'user-1', alias: 'Sky', replies: []}],
  };
  assert.equal(resolvePostCommentAlias(post, 'user-1', 'Sky'), 'Sky');
  assert.equal(resolvePostCommentAlias(post, 'user-1', 'River'), 'River');
});

test('tapping the same post reaction again clears it', () => {
  const post = {reactions: [{userId: 'user-1', value: 'love'}]};
  applyPostReaction(post, 'user-1', 'love');
  assert.deepEqual(post.reactions, []);
  applyPostReaction(post, 'user-1', 'like');
  assert.equal(post.reactions[0].value, 'like');
  applyPostReaction(post, 'user-1', 'support');
  assert.equal(post.reactions.length, 1);
  assert.equal(post.reactions[0].value, 'support');
});
