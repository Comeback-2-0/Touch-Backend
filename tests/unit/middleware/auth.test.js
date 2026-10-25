const assert = require('node:assert/strict');
const test = require('node:test');

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.ACCESS_TOKEN_EXPIRES_IN = '15m';

const {createAuthMiddleware} = require('../../../src/middleware/auth');
const auth=createAuthMiddleware({users:{findById:async()=>({_id:'user-123'})}});
const { createAccessToken } = require('../../../src/modules/auth/auth.tokens');

async function runMiddleware(headers = {}) {
  const req = { headers };
  let statusCode;
  let body;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };

  await auth(req, res, () => {
    nextCalled = true;
  });

  return { req, statusCode, body, nextCalled };
}

test('rejects requests without bearer token', async () => {
  const result = await runMiddleware();

  assert.equal(result.statusCode, 401);
  assert.equal(result.nextCalled, false);
  assert.match(result.body.error, /authorization/i);
});

test('rejects invalid bearer tokens', async () => {
  const result = await runMiddleware({ authorization: 'Bearer invalid-token' });

  assert.equal(result.statusCode, 401);
  assert.equal(result.nextCalled, false);
  assert.match(result.body.error, /invalid/i);
});

test('attaches authenticated user from valid access token', async () => {
  const token = createAccessToken({
    userId: 'user-123',
    email: 'maya@example.com',
    role: 'user',
    sessionId: 'session-123',
  });

  const result = await runMiddleware({ authorization: `Bearer ${token}` });

  assert.equal(result.nextCalled, true);
  assert.equal(result.req.user.id, 'user-123');
  assert.equal(result.req.user.email, 'maya@example.com');
  assert.equal(result.req.user.role, 'user');
  assert.equal(result.req.user.sessionId, 'session-123');
});

test('blocks existing access tokens when deletion is pending',async()=>{
 const middleware=createAuthMiddleware({users:{findById:async()=>({deletionRequest:{status:'pending'}})}});
 const token=createAccessToken({userId:'u1',email:'a@example.com',sessionId:'s1'});
 let status;let next=false;
 await middleware({headers:{authorization:`Bearer ${token}`}}, {status(n){status=n;return this;},json(){return this;}},()=>{next=true;});
 assert.equal(status,403);assert.equal(next,false);
});
