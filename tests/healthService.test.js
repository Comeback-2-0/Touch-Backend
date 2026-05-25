const assert = require('node:assert/strict');
const test = require('node:test');

const { getHealthStatus } = require('../services/healthService');

test('returns healthy status after MongoDB ping succeeds', async () => {
  let pingCalled = false;
  const connection = {
    readyState: 1,
    db: {
      admin() {
        return {
          async ping() {
            pingCalled = true;
          },
        };
      },
    },
  };

  const result = await getHealthStatus({
    connection,
    now: () => 123456789,
    uptime: () => 123.9,
  });

  assert.equal(pingCalled, true);
  assert.deepEqual(result, {
    ok: true,
    uptime: 123,
    timestamp: 123456789,
  });
});

test('returns unhealthy status when Mongoose is disconnected', async () => {
  let pingCalled = false;
  const connection = {
    readyState: 0,
    db: {
      admin() {
        return {
          async ping() {
            pingCalled = true;
          },
        };
      },
    },
  };

  const result = await getHealthStatus({ connection });

  assert.equal(pingCalled, false);
  assert.deepEqual(result, { ok: false });
});

test('returns unhealthy status when MongoDB handle is missing', async () => {
  const result = await getHealthStatus({
    connection: {
      readyState: 1,
      db: null,
    },
  });

  assert.deepEqual(result, { ok: false });
});

test('returns unhealthy status when MongoDB ping fails', async () => {
  const connection = {
    readyState: 1,
    db: {
      admin() {
        return {
          async ping() {
            throw new Error('ping failed');
          },
        };
      },
    },
  };

  const result = await getHealthStatus({ connection });

  assert.deepEqual(result, { ok: false });
});
