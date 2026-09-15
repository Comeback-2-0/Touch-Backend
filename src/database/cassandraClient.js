const cassandraDriver = require('cassandra-driver');

let client;

const REQUIRED_TABLES = [
  `CREATE TABLE IF NOT EXISTS post_view_events (
    post_id text,
    bucket text,
    event_id text,
    user_id text,
    viewed_at timestamp,
    source text,
    metadata text,
    PRIMARY KEY ((post_id, bucket), viewed_at, event_id)
  ) WITH CLUSTERING ORDER BY (viewed_at DESC, event_id ASC)`,

  `CREATE TABLE IF NOT EXISTS reel_view_events (
    reel_id text,
    bucket text,
    event_id text,
    user_id text,
    viewed_at timestamp,
    source text,
    metadata text,
    PRIMARY KEY ((reel_id, bucket), viewed_at, event_id)
  ) WITH CLUSTERING ORDER BY (viewed_at DESC, event_id ASC)`,

  `CREATE TABLE IF NOT EXISTS watch_events (
    user_id text,
    bucket text,
    event_id text,
    content_id text,
    content_type text,
    duration_ms int,
    completed boolean,
    watched_at timestamp,
    PRIMARY KEY ((user_id, bucket), watched_at, event_id)
  ) WITH CLUSTERING ORDER BY (watched_at DESC, event_id ASC)`,

  `CREATE TABLE IF NOT EXISTS feed_impression_events (
    user_id text,
    bucket text,
    event_id text,
    feed_type text,
    content_id text,
    content_type text,
    position int,
    rank_score double,
    impressed_at timestamp,
    PRIMARY KEY ((user_id, bucket), impressed_at, event_id)
  ) WITH CLUSTERING ORDER BY (impressed_at DESC, event_id ASC)`,

  `CREATE TABLE IF NOT EXISTS feed_click_events (
    user_id text,
    bucket text,
    event_id text,
    feed_type text,
    content_id text,
    content_type text,
    position int,
    clicked_at timestamp,
    PRIMARY KEY ((user_id, bucket), clicked_at, event_id)
  ) WITH CLUSTERING ORDER BY (clicked_at DESC, event_id ASC)`,

  `CREATE TABLE IF NOT EXISTS ranking_events (
    user_id text,
    bucket text,
    event_id text,
    feed_type text,
    algorithm text,
    content_id text,
    score double,
    features text,
    generated_at timestamp,
    PRIMARY KEY ((user_id, bucket), generated_at, event_id)
  ) WITH CLUSTERING ORDER BY (generated_at DESC, event_id ASC)`,

  `CREATE TABLE IF NOT EXISTS feed_preference_events (
    user_id text,
    bucket text,
    event_id text,
    content_type text,
    content_id text,
    event_type text,
    source text,
    metadata text,
    created_at timestamp,
    PRIMARY KEY ((user_id, bucket), created_at, event_id)
  ) WITH CLUSTERING ORDER BY (created_at DESC, event_id ASC)`,

  `CREATE TABLE IF NOT EXISTS user_hidden_posts (
    user_id text,
    content_type text,
    content_id text,
    hidden_at timestamp,
    source text,
    PRIMARY KEY ((user_id), content_type, content_id)
  )`,

  `CREATE TABLE IF NOT EXISTS user_feeds (
    user_id text,
    bucket text,
    rank int,
    content_id text,
    content_type text,
    reason text,
    score double,
    created_at timestamp,
    PRIMARY KEY ((user_id, bucket), rank, content_id)
  ) WITH CLUSTERING ORDER BY (rank ASC, content_id ASC)`,

  `CREATE TABLE IF NOT EXISTS community_feeds (
    community_id text,
    bucket text,
    rank int,
    content_id text,
    content_type text,
    score double,
    created_at timestamp,
    PRIMARY KEY ((community_id, bucket), rank, content_id)
  ) WITH CLUSTERING ORDER BY (rank ASC, content_id ASC)`,

  `CREATE TABLE IF NOT EXISTS trending_feeds (
    feed_key text,
    bucket text,
    rank int,
    content_id text,
    content_type text,
    score double,
    created_at timestamp,
    PRIMARY KEY ((feed_key, bucket), rank, content_id)
  ) WITH CLUSTERING ORDER BY (rank ASC, content_id ASC)`,
];

function createCassandraClient({
  secureConnectBundle = process.env.ASTRA_DB_SECURE_CONNECT_BUNDLE,
  applicationToken = process.env.ASTRA_DB_APPLICATION_TOKEN,
  keyspace = process.env.ASTRA_DB_KEYSPACE,
  cassandra = cassandraDriver,
} = {}) {
  if (!secureConnectBundle) {
    throw new Error('ASTRA_DB_SECURE_CONNECT_BUNDLE is required to connect to Cassandra/Astra CQL');
  }
  if (!applicationToken) {
    throw new Error('ASTRA_DB_APPLICATION_TOKEN is required to connect to Cassandra/Astra CQL');
  }
  if (!keyspace) {
    throw new Error('ASTRA_DB_KEYSPACE is required to connect to Cassandra/Astra CQL');
  }

  return new cassandra.Client({
    cloud: { secureConnectBundle },
    credentials: {
      username: 'token',
      password: applicationToken,
    },
    keyspace,
  });
}

function getCassandraClient(options = {}) {
  if (!client) {
    client = createCassandraClient(options);
  }
  return client;
}

async function pingCassandra(cassandraClient = getCassandraClient()) {
  await cassandraClient.execute('SELECT release_version FROM system.local');
  return true;
}

async function ensureCassandraSchema(cassandraClient = getCassandraClient()) {
  for (const statement of REQUIRED_TABLES) {
    await cassandraClient.execute(statement);
  }
}

async function closeCassandra(cassandraClient = client) {
  if (cassandraClient && typeof cassandraClient.shutdown === 'function') {
    await cassandraClient.shutdown();
  }
  if (cassandraClient === client) client = undefined;
}

module.exports = {
  REQUIRED_TABLES,
  closeCassandra,
  createCassandraClient,
  ensureCassandraSchema,
  getCassandraClient,
  pingCassandra,
};
