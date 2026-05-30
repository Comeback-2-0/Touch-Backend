const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const mongoose = require('mongoose');
const {MongoMemoryServer} = require('mongodb-memory-server');

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.NODE_ENV = 'test';

const {createAccessToken} = require('../../src/modules/auth/auth.tokens');
const feedbackRoutes = require('../../src/modules/feedback/feedback.routes');
const BugReport = require('../../src/modules/feedback/bug-report.model');
const FeatureRequest = require('../../src/modules/feedback/feature-request.model');

let mongo;

test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

test.after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test.beforeEach(async () => {
  await BugReport.deleteMany({});
  await FeatureRequest.deleteMany({});
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/feedback', feedbackRoutes);
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

function authHeader() {
  const token = createAccessToken({
    userId: 'user-123',
    email: 'maya@example.com',
    role: 'user',
    sessionId: 'session-123',
  });
  return {authorization: `Bearer ${token}`};
}

test('POST /feedback/bug-reports stores bug report', async () => {
  const app = makeApp();

  await withServer(app, async baseUrl => {
    const response = await fetch(`${baseUrl}/feedback/bug-reports`, {
      method: 'POST',
      headers: {'content-type': 'application/json', ...authHeader()},
      body: JSON.stringify({
        whatHappened: 'Screen went blank',
        stepsToReproduce: 'Open Settings and tap FAQ',
      }),
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {id: (await BugReport.findOne())._id.toString()});
  });
});

test('POST /feedback/feature-requests stores feature request', async () => {
  const app = makeApp();

  await withServer(app, async baseUrl => {
    const response = await fetch(`${baseUrl}/feedback/feature-requests`, {
      method: 'POST',
      headers: {'content-type': 'application/json', ...authHeader()},
      body: JSON.stringify({
        title: 'Community Polls',
        description: 'Allow community owners to create polls.',
      }),
    });

    assert.equal(response.status, 201);
    const saved = await FeatureRequest.findOne();
    assert.equal(saved.title, 'Community Polls');
  });
});
