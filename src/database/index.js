const mongoose = require('mongoose');
const connectMongo = require('./db');
const { connectRedis, getRedisClient } = require('./redisClient');
const {
  getPostgresClient,
  pingPostgres,
  closePostgres,
} = require('./postgresClient');
const { ensurePostgresSchema } = require('./postgresSchema');
const {
  getNeo4jDriver,
  verifyNeo4jConnectivity,
  ensureNeo4jSchema,
  closeNeo4j,
} = require('./neo4jClient');
const {
  closeCassandra,
  ensureCassandraSchema,
  getCassandraClient,
  pingCassandra,
} = require('./cassandraClient');

async function connectDatabases({
  mongo = { connect: connectMongo },
  postgres = {
    ping: () => pingPostgres(getPostgresClient()),
    ensureSchema: () => ensurePostgresSchema(getPostgresClient()),
  },
  redis = { connect: connectRedis },
  neo4j = {
    verify: () => verifyNeo4jConnectivity(getNeo4jDriver()),
    ensureSchema: () => ensureNeo4jSchema(getNeo4jDriver()),
  },
  astra = {
    createClient: getCassandraClient,
    ping: client => pingCassandra(client),
    ensureSchema: client => ensureCassandraSchema(client),
  },
} = {}) {
  const status = {};

  if (mongo) {
    await mongo.connect();
    status.mongo = true;
  }

  if (postgres) {
    await postgres.ping();
    await postgres.ensureSchema();
    status.postgres = true;
  }

  if (redis) {
    await redis.connect();
    status.redis = true;
  }

  if (neo4j) {
    await neo4j.verify();
    await neo4j.ensureSchema();
    status.neo4j = true;
  }

  if (astra) {
    const cassandraClient = astra.createClient();
    if (astra.ping) await astra.ping(cassandraClient);
    if (astra.ensureSchema) await astra.ensureSchema(cassandraClient);
    status.astra = true;
  }

  return status;
}

async function closeDatabases({
  mongo = { close: () => mongoose.connection.close() },
  postgres = { close: closePostgres },
  redis = {
    close: async () => {
      const client = getRedisClient();
      if (client.isOpen) {
        await client.quit();
      }
    },
  },
  neo4j = { close: closeNeo4j },
  astra = { close: closeCassandra },
} = {}) {
  if (astra) await astra.close();
  if (neo4j) await neo4j.close();
  if (redis) await redis.close();
  if (postgres) await postgres.close();
  if (mongo) await mongo.close();
}

module.exports = {
  connectDatabases,
  closeDatabases,
};
