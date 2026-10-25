const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const {MongoMemoryServer} = require('mongodb-memory-server');
process.env.NODE_ENV = 'test';
process.env.USER_STORE = 'mongo';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
const User = require('../../src/modules/users/user.model');
const routes = require('../../src/modules/users/user.routes');
const {createAccessToken} = require('../../src/modules/auth/auth.tokens');
let mongo;
test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});
test.after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
test('deletion saves feedback, survives retries, and blocks existing tokens', async () => {
  const user = await User.create({
    email: 'delete@example.com',
    name: 'Delete Me',
  });
  const app = express();
  app.use(express.json());
  app.use('/users', routes);
  const server = app.listen(0);
  await new Promise(resolve => server.on('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${createAccessToken({
      userId: String(user._id),
      email: user.email,
      sessionId: 's',
    })}`,
  };
  try {
    const invalid = await fetch(`${base}/users/me/deletion-request`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    assert.equal(invalid.status, 400);
    const first = await fetch(`${base}/users/me/deletion-request`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        confirmed: true,
        reason: 'Other',
        details: 'Leaving',
      }),
    });
    assert.equal(first.status, 202);
    const receipt = await first.json();
    assert.equal(
      (await User.findById(user._id)).deletionRequest.details,
      'Leaving',
    );
    const again = await fetch(`${base}/users/me/deletion-request`, {
      method: 'POST',
      headers,
      body: JSON.stringify({confirmed: true}),
    });
    assert.equal(again.status, 202);
    assert.equal((await again.json()).dueAt, receipt.dueAt);
    const blocked = await fetch(`${base}/users/me`, {headers});
    assert.equal(blocked.status, 403);
    assert.equal((await blocked.json()).code, 'ACCOUNT_DELETION_PENDING');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
