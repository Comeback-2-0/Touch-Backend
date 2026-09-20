const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');

function loadRoutesWithAuthStub() {
  const authPath = require.resolve('../../../src/middleware/auth');
  const previous = require.cache[authPath];
  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: (req, _res, next) => {
      req.user = {id: 'user-1', role: 'user'};
      next();
    },
  };
  delete require.cache[require.resolve('../../../src/modules/communities/community-content.routes')];
  const createRoutes = require('../../../src/modules/communities/community-content.routes');
  if (previous) require.cache[authPath] = previous;
  else delete require.cache[authPath];
  return createRoutes;
}

function request(app, path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const {port} = server.address();
      http.get({port, path}, res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          body += chunk;
        });
        res.on('end', () => {
          server.close(() => resolve({status: res.statusCode, body: JSON.parse(body)}));
        });
      }).on('error', err => {
        server.close(() => reject(err));
      });
    });
  });
}

test('direct content lookup returns the selected published post without scanning the feed', async () => {
  const createRoutes = loadRoutesWithAuthStub();
  let findOneArgs;
  const app = express();
  app.use('/communities/:communityId/content', createRoutes({
    repository: {
      findById: async () => ({id: 'community-1', contentVisibility: 'public'}),
      getMembership: async () => ({status: 'active', role: 'member'}),
    },
    Content: {
      findOne: query => {
        findOneArgs = query;
        return Promise.resolve({
          _id: 'post-1',
          communityId: 'community-1',
          alias: 'Anon',
          text: 'hello',
          link: '',
          media: null,
          state: 'published',
          score: 0,
          pinned: false,
          moderation: {},
          voters: [],
          comments: [],
          createdAt: new Date('2026-09-16T00:00:00.000Z'),
          publishedAt: new Date('2026-09-16T00:00:00.000Z'),
        });
      },
    },
  }));

  const response = await request(app, '/communities/community-1/content/post-1');

  assert.equal(response.status, 200);
  assert.equal(response.body.post.id, 'post-1');
  assert.equal(response.body.post.commentsCount, 0);
  assert.equal(typeof response.body.post.viewerAlias, 'string');
  assert.deepEqual(findOneArgs, {
    _id: 'post-1',
    communityId: 'community-1',
    state: 'published',
  });
});

test('post reports store reason and context without exposing reporter ids in post responses', async () => {
  const createRoutes = loadRoutesWithAuthStub();
  const post = {
    _id: 'post-1',
    communityId: 'community-1',
    alias: 'Anon',
    text: 'hello',
    link: '',
    media: null,
    state: 'published',
    score: 0,
    pinned: false,
    moderation: {status: 'none', reportsCount: 0, reports: []},
    voters: [],
    comments: [],
    createdAt: new Date('2026-09-16T00:00:00.000Z'),
    publishedAt: new Date('2026-09-16T00:00:00.000Z'),
    save: async () => post,
  };
  const app = express();
  app.use(express.json());
  app.use('/communities/:communityId/content', createRoutes({
    repository: {
      findById: async () => ({id: 'community-1', contentVisibility: 'public'}),
      getMembership: async () => ({status: 'active', role: 'member'}),
    },
    Content: {
      findOne: () => Promise.resolve(post),
    },
  }));

  const serverResponse = await new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const body = JSON.stringify({reason: 'harassment', context: 'Targeted insult'});
      const req = http.request({
        port: server.address().port,
        path: '/communities/community-1/content/post-1/report',
        method: 'POST',
        headers: {'content-type': 'application/json', 'content-length': Buffer.byteLength(body)},
      }, res => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => server.close(() => resolve({status: res.statusCode, body: JSON.parse(raw)})));
      });
      req.on('error', err => server.close(() => reject(err)));
      req.end(body);
    });
  });

  assert.equal(serverResponse.status, 200);
  assert.equal(post.moderation.reportsCount, 1);
  assert.equal(post.moderation.reports[0].reason, 'harassment');
  assert.equal(post.moderation.reports[0].context, 'Targeted insult');
  assert.equal(serverResponse.body.post.moderation.reports, undefined);
});
