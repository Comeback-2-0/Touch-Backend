const assert = require('node:assert/strict');
const test = require('node:test');
const {createStage1RateLimit} = require('../../../src/middleware/stage1RateLimit');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function redisFor(values = {}) {
  const calls = [];
  return {
    calls,
    isOpen: true,
    multi() {
      const commands = [];
      return {
        incr(key) { commands.push(['incr', key]); return this; },
        expire(key, seconds, mode) { commands.push(['expire', key, seconds, mode]); return this; },
        async exec() {
          calls.push(commands);
          return commands.map(command => command[0] === 'incr'
            ? [null, values[command[1]] || 1]
            : [null, true]);
        },
      };
    },
  };
}

test('rate limiter applies account, IP, and burst counters', async () => {
  const redis = redisFor();
  const middleware = createStage1RateLimit({
    redis,
    windowSeconds: 60,
    accountLimit: 60,
    ipLimit: 180,
    burstWindowSeconds: 10,
    burstAccountLimit: 10,
    burstIpLimit: 30,
  });
  const req = {path: '/people/suggest', ip: '127.0.0.1', user: {id: 'u1'}};
  const res = response();
  let nextCalled = false;

  await middleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  const keys = redis.calls[0].filter(command => command[0] === 'incr').map(command => command[1]);
  assert.deepEqual(keys, [
    'touch:v2:limit:/people/suggest:u1',
    'touch:v2:limit:/people/suggest:ip:127.0.0.1',
    'touch:v2:burst:/people/suggest:u1',
    'touch:v2:burst:/people/suggest:ip:127.0.0.1',
  ]);
});

test('rate limiter rejects an exceeded burst before the normal window', async () => {
  const redis = redisFor({'touch:v2:burst:/people/suggest:u1': 11});
  const middleware = createStage1RateLimit({
    redis,
    burstWindowSeconds: 10,
    burstAccountLimit: 10,
    burstIpLimit: 30,
  });
  const res = response();
  let nextCalled = false;

  await middleware({path: '/people/suggest', ip: '127.0.0.1', user: {id: 'u1'}}, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 429);
  assert.deepEqual(res.body, {error: 'Too many requests', code: 'SEARCH_RATE_LIMITED'});
});

test('rate limiter uses a stable scope instead of a parameterized request path', async () => {
  const redis = redisFor();
  const middleware = createStage1RateLimit({
    redis,
    key: 'social-follow',
    accountLimit: 30,
    ipLimit: 60,
  });
  const res = response();

  await middleware({path: '/users/target-1/follow', ip: '127.0.0.1', user: {id: 'u1'}}, res, () => {});

  const keys = redis.calls[0].filter(command => command[0] === 'incr').map(command => command[1]);
  assert.deepEqual(keys, [
    'touch:v2:limit:social-follow:u1',
    'touch:v2:limit:social-follow:ip:127.0.0.1',
  ]);
});

test('rate limiter fails closed when Redis is unavailable', async () => {
  const middleware = createStage1RateLimit({
    redis: {isOpen: false},
    key: 'search-full',
  });
  const res = response();
  let nextCalled = false;

  await middleware({path: '/people', ip: '127.0.0.1', user: {id: 'u1'}}, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    error: 'Service temporarily unavailable',
    code: 'RATE_LIMIT_STORE_UNAVAILABLE',
  });
});
