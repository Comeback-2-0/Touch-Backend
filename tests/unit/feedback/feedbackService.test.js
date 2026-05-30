const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const {MongoMemoryServer} = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';

const BugReport = require('../../../src/modules/feedback/bug-report.model');
const FeatureRequest = require('../../../src/modules/feedback/feature-request.model');
const feedbackService = require('../../../src/modules/feedback/feedback.service');

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

test('creates bug reports and sends notification email', async () => {
  const sent = [];

  const result = await feedbackService.createBugReport(
    {
      whatHappened: 'App froze on profile',
      stepsToReproduce: 'Open Settings, tap Profile',
    },
    {
      user: {id: 'u1', email: 'maya@example.com'},
      mailer: {sendFeedbackEmail: async payload => sent.push(payload)},
    },
  );

  const saved = await BugReport.findById(result.id);
  assert.equal(saved.whatHappened, 'App froze on profile');
  assert.equal(saved.stepsToReproduce, 'Open Settings, tap Profile');
  assert.equal(saved.userId, 'u1');
  assert.equal(saved.userEmail, 'maya@example.com');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'Bug Report');
});

test('creates feature requests in feature_requests collection', async () => {
  const result = await feedbackService.createFeatureRequest(
    {
      title: 'Community Polls',
      description: 'Allow community owners to create polls.',
    },
    {
      user: {id: 'u1', email: 'maya@example.com'},
      mailer: {sendFeedbackEmail: async () => undefined},
    },
  );

  const saved = await FeatureRequest.findById(result.id);
  assert.equal(saved.collection.name, 'feature_requests');
  assert.equal(saved.title, 'Community Polls');
  assert.equal(saved.description, 'Allow community owners to create polls.');
});

test('rejects incomplete feedback payloads', async () => {
  await assert.rejects(
    () => feedbackService.createBugReport({whatHappened: ''}, {user: {id: 'u1'}}),
    /what happened/i,
  );

  await assert.rejects(
    () => feedbackService.createFeatureRequest({title: 'Polls'}, {user: {id: 'u1'}}),
    /description/i,
  );
});
