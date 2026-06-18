const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createPostgresClient,
  pingPostgres,
} = require('../../../src/database/postgresClient');
const {
  createNeo4jDriver,
  verifyNeo4jConnectivity,
  ensureNeo4jSchema,
} = require('../../../src/database/neo4jClient');
const { createAstraClient } = require('../../../src/database/astraClient');

test('postgres client requires DATABASE_URL', () => {
  assert.throws(() => createPostgresClient({ url: '' }), /DATABASE_URL/);
});

test('postgres ping executes a lightweight select', async () => {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ strings: Array.from(strings), values });
    return [{ ok: 1 }];
  };

  const result = await pingPostgres(sql);

  assert.equal(result, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].strings.join(''), /select 1 as ok/i);
});

test('neo4j driver uses configured credentials and verifies connectivity', async () => {
  const created = {};
  const driver = {
    async verifyConnectivity(options) {
      created.verifyOptions = options;
    },
  };

  const result = createNeo4jDriver({
    uri: 'neo4j+s://example.databases.neo4j.io',
    username: 'neo4j',
    password: 'secret',
    database: 'neo4j',
    driverFactory(uri, auth) {
      created.uri = uri;
      created.auth = auth;
      return driver;
    },
    basicAuth(username, password) {
      return { username, password };
    },
  });

  await verifyNeo4jConnectivity(result);

  assert.equal(created.uri, 'neo4j+s://example.databases.neo4j.io');
  assert.deepEqual(created.auth, { username: 'neo4j', password: 'secret' });
  assert.deepEqual(created.verifyOptions, { database: 'neo4j' });
});

test('neo4j schema bootstrap creates unique id constraints for graph nodes', async () => {
  const queries = [];
  const driver = {
    session(options) {
      queries.push({ sessionOptions: options });
      return {
        async run(cypher) {
          queries.push({ cypher });
        },
        async close() {
          queries.push({ closed: true });
        },
      };
    },
  };
  driver.__touchDatabase = 'neo4j';

  await ensureNeo4jSchema(driver);

  const schema = queries.map(entry => entry.cypher || '').join('\n');
  assert.match(schema, /CREATE CONSTRAINT touch_user_id_unique IF NOT EXISTS/i);
  assert.match(schema, /FOR \(u:User\) REQUIRE u\.id IS UNIQUE/i);
  assert.match(schema, /CREATE CONSTRAINT touch_post_id_unique IF NOT EXISTS/i);
  assert.match(schema, /FOR \(p:Post\) REQUIRE p\.id IS UNIQUE/i);
  assert.match(schema, /CREATE CONSTRAINT touch_reel_id_unique IF NOT EXISTS/i);
  assert.match(schema, /FOR \(r:Reel\) REQUIRE r\.id IS UNIQUE/i);
  assert.deepEqual(queries[0].sessionOptions, { database: 'neo4j' });
});

test('astra client writes Data API commands with token and keyspace', async () => {
  const requests = [];
  const client = createAstraClient({
    apiEndpoint: 'https://astra.example.com',
    applicationToken: 'AstraCS:token',
    keyspace: 'touch',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return { status: { insertedIds: ['event-1'] } };
        },
      };
    },
  });

  const result = await client.insertOne('post_view_events', { eventId: 'event-1' });

  assert.deepEqual(result, { status: { insertedIds: ['event-1'] } });
  assert.equal(
    requests[0].url,
    'https://astra.example.com/api/json/v1/touch/post_view_events',
  );
  assert.equal(requests[0].options.headers.Token, 'AstraCS:token');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    insertOne: { document: { eventId: 'event-1' } },
  });
});
