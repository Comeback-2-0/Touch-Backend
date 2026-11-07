const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const test = require('node:test');
const {createSearchRouter} = require('../../src/modules/search/search.routes');

async function withServer(app, callback) {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('People Search is authenticated and exposes only the fixed safe response', async () => {
  const calls = [];
  const app = express();
  app.use('/v1/search', createSearchRouter({
    authMiddleware: async (req, res, next) => { req.user = {id: 'viewer'}; next(); },
    rateLimitFactory: options => (req, res, next) => { calls.push(options); next(); },
    searchService: {people: async input => ({items: [{userId: 'u1', name: 'Roy', username: 'roy', secret: 'hidden'}], query: input.query})},
  }));

  await withServer(app, async baseUrl => {
    const response = await fetch(`${baseUrl}/v1/search/people?q=roy`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {items: [{userId: 'u1', name: 'Roy', username: 'roy', profilePhoto: ''}], nextCursor: null, query: 'roy'});
    const suggestions = await fetch(`${baseUrl}/v1/search/people/suggest?q=roy`);
    assert.equal(suggestions.status, 200);
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    key: 'search-full',
    accountLimit: 30,
    ipLimit: 120,
  });
  assert.deepEqual(calls[1], {
    key: 'search-suggestions',
    accountLimit: 60,
    ipLimit: 180,
    burstWindowSeconds: 10,
    burstAccountLimit: 10,
    burstIpLimit: 30,
  });
});

test('default People Search route rejects requests without a bearer token', async () => {
  const app = express();
  app.use('/v1/search', createSearchRouter({
    searchService: {people: async () => ({items: []})},
    rateLimitFactory: () => (req, res, next) => next(),
  }));

  await withServer(app, async baseUrl => {
    const response = await fetch(`${baseUrl}/v1/search/people?q=roy`);
    assert.equal(response.status, 401);
  });
});

test('People Search rejects an authenticated account that has not completed profile setup', async () => {
  const app = express();
  app.use('/v1/search', createSearchRouter({
    authMiddleware: async (req, res, next) => {
      req.user = {id: 'incomplete', isProfileComplete: false};
      next();
    },
    rateLimitFactory: () => (req, res, next) => next(),
    searchService: {people: async () => ({items: []})},
  }));

  await withServer(app, async baseUrl => {
    const response = await fetch(`${baseUrl}/v1/search/people?q=roy`);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: 'Complete your profile to use this feature',
      code: 'PROFILE_SETUP_REQUIRED',
    });
  });
});

test('People Search propagates a bounded request ID for support correlation', async () => {
  let captured;
  const app = express();
  app.use('/v1/search', createSearchRouter({
    authMiddleware: async (req, res, next) => { req.user = {id: 'viewer'}; next(); },
    rateLimitFactory: () => (req, res, next) => next(),
    searchService: {people: async input => { captured = input; return {items: [], query: input.query}; }},
  }));

  await withServer(app, async baseUrl => {
    const response = await fetch(`${baseUrl}/v1/search/people?q=roy`, {
      headers: {'X-Request-Id': 'stage1-search-123'},
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-request-id'), 'stage1-search-123');
  });

  assert.equal(captured.requestId, 'stage1-search-123');
});
