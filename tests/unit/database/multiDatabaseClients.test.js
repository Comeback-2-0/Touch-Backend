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
const {
  createCassandraClient,
  ensureCassandraSchema,
} = require('../../../src/database/cassandraClient');

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

test('cassandra client uses Astra secure bundle and application token credentials', () => {
  const created = {};
  const client = createCassandraClient({
    secureConnectBundle: 'C:/secure-connect-touch.zip',
    applicationToken: 'AstraCS:token',
    keyspace: 'touch',
    cassandra: {
      Client: class Client {
        constructor(options) {
          created.options = options;
        }
      },
    },
  });

  assert.ok(client);
  assert.deepEqual(created.options.cloud, { secureConnectBundle: 'C:/secure-connect-touch.zip' });
  assert.deepEqual(created.options.credentials, {
    username: 'token',
    password: 'AstraCS:token',
  });
  assert.equal(created.options.keyspace, 'touch');
});

test('cassandra schema bootstrap creates feed and event tables', async () => {
  const queries = [];
  const client = {
    async execute(query) {
      queries.push(query);
    },
  };

  await ensureCassandraSchema(client);

  const schema = queries.join('\n');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS post_view_events/i);
  assert.match(schema, /PRIMARY KEY \(\(post_id, bucket\), viewed_at, event_id\)/i);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS feed_preference_events/i);
  assert.match(schema, /PRIMARY KEY \(\(user_id, bucket\), created_at, event_id\)/i);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS user_hidden_posts/i);
  assert.match(schema, /PRIMARY KEY \(\(user_id\), content_type, content_id\)/i);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS user_feeds/i);
  assert.match(schema, /PRIMARY KEY \(\(user_id, bucket\), rank, content_id\)/i);
});
