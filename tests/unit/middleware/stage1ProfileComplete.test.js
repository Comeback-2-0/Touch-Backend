const assert = require('node:assert/strict');
const test = require('node:test');
const {requireStage1Profile} = require('../../../src/middleware/stage1ProfileComplete');

function response() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('Stage 1 routes reject authenticated accounts that have not completed profile setup', () => {
  const res = response();
  let called = false;

  requireStage1Profile({user: {id: 'incomplete', isProfileComplete: false}}, res, () => { called = true; });

  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    error: 'Complete your profile to use this feature',
    code: 'PROFILE_SETUP_REQUIRED',
  });
});

test('Stage 1 routes allow a completed profile', () => {
  const res = response();
  let called = false;

  requireStage1Profile({user: {id: 'complete', isProfileComplete: true}}, res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(res.statusCode, null);
});
