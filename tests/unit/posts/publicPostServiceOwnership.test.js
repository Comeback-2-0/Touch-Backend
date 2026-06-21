const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createPost,
  getPostEngagementStatus,
  likePost,
  listFeed,
  unlikePost,
} = require('../../../src/modules/posts/public-post.service');

function makePost(overrides = {}) {
  return {
    _id: {
      toString: () => overrides.id || 'post-1',
    },
    authorId: 'author-1',
    authorSnapshot: {name: 'Author', username: 'author', profilePicture: ''},
    text: 'Hello',
    media: [],
    visibility: 'public',
    status: 'active',
    engagement: {
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      savesCount: 0,
      reportsCount: 0,
      ...(overrides.engagement || {}),
    },
    moderation: { isFlagged: false, reviewStatus: 'none' },
    createdAt: new Date('2026-06-18T00:00:00.000Z'),
    updatedAt: new Date('2026-06-18T00:00:00.000Z'),
    ...overrides,
  };
}

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

test('likePost stores the relationship in Neo4j and increments Mongo count only when changed', async () => {
  const calls = [];
  const post = makePost({engagement: {likesCount: 2}});
  const postRepository = {
    async findActivePublicById(postId) {
      calls.push(`find:${postId}`);
      return post;
    },
    async incrementLikesCount(postId, by) {
      calls.push(`increment:${postId}:${by}`);
      post.engagement.likesCount += by;
      return post;
    },
  };
  const engagementRepository = {
    async likeContentIfAbsent(input) {
      calls.push(`neo4j:${input.userId}:${input.contentId}:${input.contentType}`);
      return true;
    },
  };

  const result = await likePost('post-1', {
    user: {id: 'user-1'},
    postRepository,
    engagementRepository,
  });

  assert.deepEqual(result, {liked: true, likesCount: 3});
  assert.deepEqual(calls, [
    'find:post-1',
    'neo4j:user-1:post-1:post',
    'increment:post-1:1',
  ]);
});

test('likePost is idempotent when the viewer already liked the post', async () => {
  const calls = [];
  const post = makePost({engagement: {likesCount: 4}});
  const postRepository = {
    async findActivePublicById(postId) {
      calls.push(`find:${postId}`);
      return post;
    },
    async incrementLikesCount() {
      calls.push('increment');
      return post;
    },
  };
  const engagementRepository = {
    async likeContentIfAbsent() {
      calls.push('neo4j');
      return false;
    },
  };

  const result = await likePost('post-1', {
    user: {id: 'user-1'},
    postRepository,
    engagementRepository,
  });

  assert.deepEqual(result, {liked: true, likesCount: 4});
  assert.deepEqual(calls, ['find:post-1', 'neo4j']);
});

test('unlikePost removes the Neo4j relationship and clamps the Mongo count at zero', async () => {
  const calls = [];
  const post = makePost({engagement: {likesCount: 0}});
  const postRepository = {
    async findActivePublicById(postId) {
      calls.push(`find:${postId}`);
      return post;
    },
    async decrementLikesCount(postId) {
      calls.push(`decrement:${postId}`);
      post.engagement.likesCount = Math.max(0, post.engagement.likesCount - 1);
      return post;
    },
  };
  const engagementRepository = {
    async unlikeContentIfPresent() {
      calls.push('neo4j');
      return true;
    },
  };

  const result = await unlikePost('post-1', {
    user: {id: 'user-1'},
    postRepository,
    engagementRepository,
  });

  assert.deepEqual(result, {liked: false, likesCount: 0});
  assert.deepEqual(calls, ['find:post-1', 'neo4j', 'decrement:post-1']);
});

test('getPostEngagementStatus returns viewer liked state from Neo4j and count from Mongo', async () => {
  const post = makePost({engagement: {likesCount: 7}});
  const result = await getPostEngagementStatus('post-1', {
    user: {id: 'user-1'},
    postRepository: {
      async findActivePublicById() {
        return post;
      },
    },
    engagementRepository: {
      async hasLiked(input) {
        assert.deepEqual(input, {userId: 'user-1', contentId: 'post-1', contentType: 'post'});
        return true;
      },
    },
  });

  assert.deepEqual(result, {liked: true, likesCount: 7});
});

test('public post list includes viewerEngagement from one batch Neo4j lookup', async () => {
  const calls = [];
  const posts = [
    makePost({id: 'post-1', text: 'First'}),
    makePost({id: 'post-2', text: 'Second'}),
  ];

  const result = await listFeed({}, {
    user: {id: 'viewer-1'},
    postRepository: {
      async findPage(query) {
        calls.push(`mongo:${query.limit}:${query.cursor || ''}`);
        return {posts, nextCursor: null};
      },
    },
    engagementRepository: {
      async likedContentIds(input) {
        calls.push(`neo4j:${input.userId}:${input.contentIds.join(',')}`);
        return ['post-2'];
      },
    },
  });

  assert.deepEqual(result.posts.map(post => post.viewerEngagement), [
    {liked: false},
    {liked: true},
  ]);
  assert.deepEqual(calls, ['mongo:undefined:', 'neo4j:viewer-1:post-1,post-2']);
});

test('likePost returns 404 for missing, deleted, or non-public posts', async () => {
  await assert.rejects(
    () => likePost('missing-post', {
      user: {id: 'user-1'},
      postRepository: {
        async findActivePublicById() {
          return null;
        },
      },
      engagementRepository: {},
    }),
    error => error.statusCode === 404 && /post not found/i.test(error.message),
  );
});
