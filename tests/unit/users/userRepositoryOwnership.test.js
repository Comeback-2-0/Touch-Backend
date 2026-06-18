const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createUserRepository,
  shouldUsePostgres,
} = require('../../../src/modules/users/user.repository');

function withEnv(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('user repository delegates to PostgreSQL when configured', async () => {
  const calls = [];
  const repository = createUserRepository({
    mode: 'postgres',
    postgresRepository: {
      async findById(userId) {
        calls.push(`postgres:${userId}`);
        return { id: userId };
      },
    },
    mongoRepository: {
      async findById(userId) {
        calls.push(`mongo:${userId}`);
        return { _id: userId };
      },
    },
  });

  assert.deepEqual(await repository.findById('user-1'), { id: 'user-1' });
  assert.deepEqual(calls, ['postgres:user-1']);
});

test('user repository can fall back to Mongo for test compatibility', async () => {
  await withEnv({ NODE_ENV: 'test' }, async () => {
    const calls = [];
    const repository = createUserRepository({
      mode: 'mongo',
      postgresRepository: {
        async findById(userId) {
          calls.push(`postgres:${userId}`);
          return { id: userId };
        },
      },
      mongoRepository: {
        async findById(userId) {
          calls.push(`mongo:${userId}`);
          return { _id: userId };
        },
      },
    });

    assert.deepEqual(await repository.findById('user-1'), { _id: 'user-1' });
    assert.deepEqual(calls, ['mongo:user-1']);
  });
});

test('production user store cannot silently fall back to Mongo', () => {
  withEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db', USER_STORE: 'mongo' }, () => {
    assert.throws(
      () => shouldUsePostgres(),
      /Mongo user store is not allowed in production/,
    );
  });
});

test('production user store requires DATABASE_URL', () => {
  withEnv({ NODE_ENV: 'production', DATABASE_URL: undefined, USER_STORE: undefined }, () => {
    assert.throws(
      () => shouldUsePostgres(),
      /DATABASE_URL is required in production/,
    );
  });
});
