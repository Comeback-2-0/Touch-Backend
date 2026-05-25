const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');

const createHealthRoutes = require('../routes/healthRoutes');

async function requestHealth(service) {
  const app = express();
  app.use('/health', createHealthRoutes({ getHealthStatus: service }));

  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
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
