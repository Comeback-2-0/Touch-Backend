const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const mongoose = require('mongoose');
const {MongoMemoryServer} = require('mongodb-memory-server');

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.NODE_ENV = 'test';

const {createAccessToken} = require('../../src/modules/auth/auth.tokens');
const User = require('../../src/modules/users/user.model');
const PublicPost = require('../../src/modules/posts/public-post.model');
const publicPostRoutes = require('../../src/modules/posts/public-post.routes');
const legacyPostRoutes = require('../../src/modules/posts/post.routes');

let mongo;

test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.syncIndexes();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test.beforeEach(async () => {
  await User.deleteMany({});
  await PublicPost.deleteMany({});
});

function makeApp(options = {}) {
  const normalizedOptions = options && (options.uploadPostImage || typeof options === 'function')
    ? {postStorage: options}
    : options;
  const engagementRepository = normalizedOptions.engagementRepository || {
    async likedContentIds() {
      return [];
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/posts', publicPostRoutes({...normalizedOptions, engagementRepository}));
  app.use('/legacy/community-posts', legacyPostRoutes);
  return app;
}

async function withServer(app, fn) {
  const server = app.listen(0);
  const {port} = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
  }
}

async function createUser(overrides = {}) {
  return User.create({
    email: overrides.email || `user-${Date.now()}-${Math.random()}@example.com`,
    firebaseUid: overrides.firebaseUid || `firebase-${Date.now()}-${Math.random()}`,
    uid: overrides.uid || `legacy-${Date.now()}-${Math.random()}`,
    name: overrides.name || 'Test User',
    username: overrides.username || 'test.user',
    profilePicture: overrides.profilePicture || 'https://cdn.example.com/avatar.jpg',
    ...overrides,
  });
}

function authHeader(user) {
  const token = createAccessToken({
    userId: user._id.toString(),
    email: user.email,
    role: user.role || 'user',
    sessionId: 'session-123',
  });
  return {authorization: `Bearer ${token}`};
}

test('POST /posts requires authentication', async () => {
  const app = makeApp();

  await withServer(app, async baseUrl => {
    const response = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      body: new FormData(),
    });

    assert.equal(response.status, 401);
  });
});

test('POST /posts rejects an empty payload', async () => {
  const user = await createUser();
  const app = makeApp();

  await withServer(app, async baseUrl => {
    const response = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers: authHeader(user),
      body: new FormData(),
    });

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /text or image/i);
  });
});

test('POST /posts creates a text-only public post and increments postsCount', async () => {
  const user = await createUser({postsCount: 0});
  const app = makeApp();

  await withServer(app, async baseUrl => {
    const form = new FormData();
    form.append('text', '  First public post  ');

    const response = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers: authHeader(user),
      body: form,
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.post.text, 'First public post');
    assert.equal(body.post.author.id, user._id.toString());
    assert.deepEqual(body.post.media, []);

    const saved = await PublicPost.findById(body.post.id);
    assert.equal(saved.text, 'First public post');
    assert.equal(saved.authorId.toString(), user._id.toString());
    assert.equal((await User.findById(user._id)).postsCount, 1);
  });
});

test('POST /posts creates an image post with Cloudinary metadata', async () => {
  const user = await createUser();
  const postStorage = {
    uploadPostImage: async file => ({
      url: `https://cdn.example.com/${file.originalname}`,
      publicId: `touch/posts/${file.originalname}`,
      width: 1200,
      height: 900,
      format: 'png',
    }),
  };
  const app = makeApp(postStorage);

  await withServer(app, async baseUrl => {
    const form = new FormData();
    form.append('text', 'Image post');
    form.append('images', new Blob(['png'], {type: 'image/png'}), 'post.png');

    const response = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers: authHeader(user),
      body: form,
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.post.media.length, 1);
    assert.equal(body.post.media[0].url, 'https://cdn.example.com/post.png');
    assert.equal(body.post.media[0].publicId, 'touch/posts/post.png');
    assert.equal(body.post.media[0].width, 1200);
  });
});

test('POST /posts creates a post with up to 10 ordered images', async () => {
  const user = await createUser();
  const postStorage = {
    uploadPostImage: async file => ({
      url: `https://cdn.example.com/${file.originalname}`,
      publicId: `touch/posts/${file.originalname}`,
      width: 1000,
      height: 1000,
      format: 'jpg',
    }),
  };
  const app = makeApp(postStorage);

  await withServer(app, async baseUrl => {
    const form = new FormData();
    form.append('text', 'Carousel caption');
    for (let index = 1; index <= 10; index += 1) {
      form.append('images', new Blob([`jpg-${index}`], {type: 'image/jpeg'}), `post-${index}.jpg`);
    }

    const response = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers: authHeader(user),
      body: form,
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.post.media.length, 10);
    assert.deepEqual(
      body.post.media.map(media => media.url),
      Array.from({length: 10}, (_, index) => `https://cdn.example.com/post-${index + 1}.jpg`),
    );
  });
});

test('POST /posts rejects more than 10 images', async () => {
  const user = await createUser();
  const app = makeApp();

  await withServer(app, async baseUrl => {
    const form = new FormData();
    for (let index = 1; index <= 11; index += 1) {
      form.append('images', new Blob([`jpg-${index}`], {type: 'image/jpeg'}), `post-${index}.jpg`);
    }

    const response = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers: authHeader(user),
      body: form,
    });

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /10 images/i);
  });
});

test('POST /posts rejects unsupported image MIME types and oversized images', async () => {
  const user = await createUser();
  const app = makeApp();

  await withServer(app, async baseUrl => {
    const badType = new FormData();
    badType.append('image', new Blob(['text'], {type: 'text/plain'}), 'note.txt');
    const badTypeResponse = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers: authHeader(user),
      body: badType,
    });
    assert.equal(badTypeResponse.status, 400);

    const tooLarge = new FormData();
    tooLarge.append('image', new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], {type: 'image/png'}), 'large.png');
    const tooLargeResponse = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers: authHeader(user),
      body: tooLarge,
    });
    assert.equal(tooLargeResponse.status, 400);
  });
});

test('POST /posts handles upload failure without creating a post or incrementing postsCount', async () => {
  const user = await createUser({postsCount: 0});
  const postStorage = {
    uploadPostImage: async () => {
      throw new Error('Cloudinary unavailable');
    },
  };
  const app = makeApp(postStorage);

  await withServer(app, async baseUrl => {
    const form = new FormData();
    form.append('text', 'Image post');
    form.append('images', new Blob(['png'], {type: 'image/png'}), 'post.png');

    const response = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers: authHeader(user),
      body: form,
    });

    assert.equal(response.status, 500);
    assert.equal(await PublicPost.countDocuments(), 0);
    assert.equal((await User.findById(user._id)).postsCount, 0);
  });
});

test('GET /posts/feed and /posts/user/:userId return active public posts newest first', async () => {
  const author = await createUser({email: 'author@example.com', username: 'author'});
  const other = await createUser({email: 'other@example.com', username: 'other'});
  const viewer = await createUser({email: 'viewer@example.com', username: 'viewer'});

  const older = await PublicPost.create({
    authorId: author._id,
    authorSnapshot: {name: author.name, username: author.username, profilePicture: author.profilePicture},
    text: 'Older',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  const newer = await PublicPost.create({
    authorId: author._id,
    authorSnapshot: {name: author.name, username: author.username, profilePicture: author.profilePicture},
    text: 'Newer',
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
  });
  await PublicPost.create({
    authorId: other._id,
    authorSnapshot: {name: other.name, username: other.username, profilePicture: other.profilePicture},
    text: 'Other author',
    createdAt: new Date('2026-01-03T00:00:00.000Z'),
  });
  await PublicPost.create({
    authorId: author._id,
    authorSnapshot: {name: author.name, username: author.username, profilePicture: author.profilePicture},
    text: 'Hidden',
    status: 'deleted',
  });

  const app = makeApp();

  await withServer(app, async baseUrl => {
    const feed = await fetch(`${baseUrl}/posts/feed?limit=2`, {
      headers: authHeader(viewer),
    });
    assert.equal(feed.status, 200);
    const feedBody = await feed.json();
    assert.deepEqual(feedBody.posts.map(post => post.text), ['Other author', 'Newer']);
    assert.equal(Boolean(feedBody.nextCursor), true);

    const authorPosts = await fetch(`${baseUrl}/posts/user/${author._id}`, {
      headers: authHeader(viewer),
    });
    assert.equal(authorPosts.status, 200);
    const authorBody = await authorPosts.json();
    assert.deepEqual(authorBody.posts.map(post => post.id), [newer._id.toString(), older._id.toString()]);
  });
});

test('POST /posts/:postId/like requires auth and returns liked state from the service', async () => {
  const user = await createUser();
  const calls = [];
  const app = makeApp({
    postService: {
      async likePost(postId, options) {
        calls.push(`like:${postId}:${options.user.id}`);
        return {liked: true, likesCount: 12};
      },
    },
  });

  await withServer(app, async baseUrl => {
    const unauthenticated = await fetch(`${baseUrl}/posts/post-1/like`, {method: 'POST'});
    assert.equal(unauthenticated.status, 401);

    const response = await fetch(`${baseUrl}/posts/post-1/like`, {
      method: 'POST',
      headers: authHeader(user),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {liked: true, likesCount: 12});
    assert.deepEqual(calls, [`like:post-1:${user._id}`]);
  });
});

test('DELETE /posts/:postId/like returns unliked state from the service', async () => {
  const user = await createUser();
  const app = makeApp({
    postService: {
      async unlikePost(postId, options) {
        assert.equal(postId, 'post-1');
        assert.equal(options.user.id, user._id.toString());
        return {liked: false, likesCount: 11};
      },
    },
  });

  await withServer(app, async baseUrl => {
    const response = await fetch(`${baseUrl}/posts/post-1/like`, {
      method: 'DELETE',
      headers: authHeader(user),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {liked: false, likesCount: 11});
  });
});

test('GET /posts/:postId/engagement-status returns viewer status from the service', async () => {
  const user = await createUser();
  const app = makeApp({
    postService: {
      async getPostEngagementStatus(postId, options) {
        assert.equal(postId, 'post-1');
        assert.equal(options.user.id, user._id.toString());
        return {liked: true, likesCount: 3};
      },
    },
  });

  await withServer(app, async baseUrl => {
    const response = await fetch(`${baseUrl}/posts/post-1/engagement-status`, {
      headers: authHeader(user),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {liked: true, likesCount: 3});
  });
});

test('POST and DELETE /posts/:postId/report require auth and return report state from the service', async () => {
  const user = await createUser();
  const calls = [];
  const app = makeApp({
    postService: {
      async reportPost(postId, payload, options) {
        calls.push(`report:${postId}:${payload.reason}:${payload.details}:${options.user.id}`);
        return {
          reported: true,
          status: 'open',
          reportsCount: 1,
          moderation: {isFlagged: true, reviewStatus: 'pending'},
        };
      },
      async withdrawPostReport(postId, options) {
        calls.push(`withdraw:${postId}:${options.user.id}`);
        return {
          reported: false,
          status: 'withdrawn',
          reportsCount: 0,
          moderation: {isFlagged: false, reviewStatus: 'none'},
        };
      },
    },
  });

  await withServer(app, async baseUrl => {
    const unauthenticated = await fetch(`${baseUrl}/posts/post-1/report`, {method: 'POST'});
    assert.equal(unauthenticated.status, 401);

    const report = await fetch(`${baseUrl}/posts/post-1/report`, {
      method: 'POST',
      headers: {...authHeader(user), 'content-type': 'application/json'},
      body: JSON.stringify({reason: 'spam', details: 'Bad post'}),
    });
    assert.equal(report.status, 200);
    assert.deepEqual(await report.json(), {
      reported: true,
      status: 'open',
      reportsCount: 1,
      moderation: {isFlagged: true, reviewStatus: 'pending'},
    });

    const withdraw = await fetch(`${baseUrl}/posts/post-1/report`, {
      method: 'DELETE',
      headers: authHeader(user),
    });
    assert.equal(withdraw.status, 200);
    assert.deepEqual(await withdraw.json(), {
      reported: false,
      status: 'withdrawn',
      reportsCount: 0,
      moderation: {isFlagged: false, reviewStatus: 'none'},
    });
    assert.deepEqual(calls, [
      `report:post-1:spam:Bad post:${user._id}`,
      `withdraw:post-1:${user._id}`,
    ]);
  });
});

test('POST and DELETE /posts/:postId/not-interested return hidden state from the service', async () => {
  const user = await createUser();
  const calls = [];
  const app = makeApp({
    postService: {
      async markPostNotInterested(postId, options) {
        calls.push(`hide:${postId}:${options.user.id}`);
        return {hidden: true};
      },
      async undoPostNotInterested(postId, options) {
        calls.push(`undo:${postId}:${options.user.id}`);
        return {hidden: false};
      },
    },
  });

  await withServer(app, async baseUrl => {
    const hide = await fetch(`${baseUrl}/posts/post-1/not-interested`, {
      method: 'POST',
      headers: authHeader(user),
    });
    assert.equal(hide.status, 200);
    assert.deepEqual(await hide.json(), {hidden: true});

    const undo = await fetch(`${baseUrl}/posts/post-1/not-interested`, {
      method: 'DELETE',
      headers: authHeader(user),
    });
    assert.equal(undo.status, 200);
    assert.deepEqual(await undo.json(), {hidden: false});
    assert.deepEqual(calls, [
      `hide:post-1:${user._id}`,
      `undo:post-1:${user._id}`,
    ]);
  });
});

test('legacy group post routes remain reachable under /legacy/community-posts', async () => {
  const app = makeApp();
  const groupId = new mongoose.Types.ObjectId().toString();

  await withServer(app, async baseUrl => {
    const response = await fetch(`${baseUrl}/legacy/community-posts/${groupId}/posts`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  });
});
