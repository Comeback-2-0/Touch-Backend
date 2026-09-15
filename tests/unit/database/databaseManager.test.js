const assert = require('node:assert/strict');
const test = require('node:test');

const {
  connectDatabases,
  closeDatabases,
} = require('../../../src/database');

test('connectDatabases initializes each configured owner in order', async () => {
  const calls = [];

  const status = await connectDatabases({
    mongo: {
      connect: async () => calls.push('mongo'),
    },
    postgres: {
      ping: async () => calls.push('postgres:ping'),
      ensureSchema: async () => calls.push('postgres:schema'),
    },
    redis: {
      connect: async () => calls.push('redis'),
    },
    neo4j: {
      verify: async () => calls.push('neo4j:verify'),
      ensureSchema: async () => calls.push('neo4j:schema'),
    },
    astra: {
      createClient: () => {
        calls.push('astra');
        return {};
      },
      ping: async () => calls.push('astra:ping'),
      ensureSchema: async () => calls.push('astra:schema'),
    },
  });

  assert.deepEqual(calls, [
    'mongo',
    'postgres:ping',
    'postgres:schema',
    'redis',
    'neo4j:verify',
    'neo4j:schema',
    'astra',
    'astra:ping',
    'astra:schema',
  ]);
  assert.deepEqual(status, {
    mongo: true,
    postgres: true,
    redis: true,
    neo4j: true,
    astra: true,
  });
});

test('closeDatabases closes persistent clients', async () => {
  const calls = [];

  await closeDatabases({
    mongo: {
      close: async () => calls.push('mongo'),
    },
    postgres: {
      close: async () => calls.push('postgres'),
    },
    redis: {
      close: async () => calls.push('redis'),
    },
    neo4j: {
      close: async () => calls.push('neo4j'),
    },
    astra: {
      close: async () => calls.push('astra'),
    },
  });

  assert.deepEqual(calls, ['astra', 'neo4j', 'redis', 'postgres', 'mongo']);
});
