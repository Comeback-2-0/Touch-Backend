const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');

const createHealthRoutes = require('../../src/modules/health/health.routes');

async function requestHealth(service, {path = '/health', searchService} = {}) {
  const app = express();
  app.use('/health', createHealthRoutes({ getHealthStatus: service, getSearchHealthStatus: searchService }));

  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    return {
      status: response.status,
      body: await response.json(),
    };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  }
}

test('GET /health returns 200 with healthy payload', async () => {
  const result = await requestHealth(async () => ({
    ok: true,
    uptime: 123,
    timestamp: 123456789,
  }));

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    ok: true,
    uptime: 123,
    timestamp: 123456789,
  });
});

test('GET /health returns 500 with unhealthy payload', async () => {
  const result = await requestHealth(async () => ({ ok: false }));

  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { ok: false });
});

test('GET /health/search reports a safe database readiness result', async () => {
  const result = await requestHealth(async () => ({ok: true}), {
    path: '/health/search',
    searchService: async () => ({ok: false, dependencies: {postgres: 'error', neo4j: 'ok'}}),
  });

  assert.equal(result.status, 503);
  assert.deepEqual(result.body, {ok: false, dependencies: {postgres: 'error', neo4j: 'ok'}});
});
