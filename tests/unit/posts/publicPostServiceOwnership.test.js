const assert = require('node:assert/strict');
const test = require('node:test');

const { createPost } = require('../../../src/modules/posts/public-post.service');

test('public post creation reads and updates users through the user repository', async () => {
  const calls = [];
  const userRepository = {
    async findById(userId) {
      calls.push(`find:${userId}`);
      return {
        _id: userId,
        id: userId,
        name: 'Maya',
        username: 'maya',
        profilePicture: 'https://cdn.example.com/maya.jpg',
      };
    },
    async incrementPostsCount(userId, by) {
      calls.push(`increment:${userId}:${by}`);
    },
  };
  const postRepository = {
    async create(input) {
      calls.push(`post:${input.authorId}:${input.text}`);
      return {
        _id: { toString: () => 'post-1' },
        ...input,
        visibility: 'public',
        status: 'active',
        engagement: { likesCount: 0, commentsCount: 0, sharesCount: 0, savesCount: 0, reportsCount: 0 },
        moderation: { isFlagged: false, reviewStatus: 'none' },
        createdAt: new Date('2026-06-18T00:00:00.000Z'),
        updatedAt: new Date('2026-06-18T00:00:00.000Z'),
      };
    },
  };

  const post = await createPost(
    { text: '  Hello  ' },
    {
      user: { id: 'user-1' },
      files: [],
      userRepository,
      postRepository,
    },
  );

  assert.equal(post.id, 'post-1');
  assert.equal(post.author.id, 'user-1');
  assert.deepEqual(calls, [
    'find:user-1',
    'post:user-1:Hello',
    'increment:user-1:1',
  ]);
});
