const assert = require('node:assert/strict');
const test = require('node:test');
const {createStage1FeatureGate} = require('../../../src/middleware/stage1FeatureGate');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('Stage 1 routes fail closed when the production feature flag is disabled', () => {
  const middleware = createStage1FeatureGate({enabled: false});
  const res = response();
  let called = false;
  middleware({}, res, () => { called = true; });

  assert.equal(called, false);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {error: 'Not found'});
});

test('Stage 1 routes pass when explicitly enabled', () => {
  const middleware = createStage1FeatureGate({enabled: true});
  const res = response();
  let called = false;
  middleware({}, res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

