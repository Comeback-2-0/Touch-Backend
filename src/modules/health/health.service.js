const mongoose = require('mongoose');
const { getPostgresClient, pingPostgres } = require('../../database/postgresClient');
const { connectRedis } = require('../../database/redisClient');
const { getNeo4jDriver, verifyNeo4jConnectivity } = require('../../database/neo4jClient');
const { createAstraClient } = require('../../database/astraClient');

async function pingMongo(connection = mongoose.connection) {
  if (!connection || connection.readyState !== 1 || !connection.db) {
    throw new Error('MongoDB is not connected');
  }

  await connection.db.admin().ping();
  return true;
}

async function pingRedis() {
  const redis = await connectRedis();
  await redis.ping();
  return true;
}

function checkAstraConfigured() {
  createAstraClient();
  return true;
}

function defaultChecks() {
  return {
    mongo: () => pingMongo(mongoose.connection),
    postgres: () => pingPostgres(getPostgresClient()),
    redis: pingRedis,
    neo4j: () => verifyNeo4jConnectivity(getNeo4jDriver()),
    astra: checkAstraConfigured,
  };
}

async function runChecks(checks) {
  const dependencies = {};
  let ok = true;

  for (const [name, check] of Object.entries(checks)) {
    try {
      const result = await check();
      dependencies[name] = result === false ? 'error' : 'ok';
      if (result === false) ok = false;
    } catch (err) {
      dependencies[name] = 'error';
      ok = false;
    }
  }

  return { ok, dependencies };
}

async function getHealthStatus({
  connection,
  checks,
  now = Date.now,
  uptime = process.uptime,
} = {}) {
  const selectedChecks = checks || (
    connection ? { mongo: () => pingMongo(connection) } : defaultChecks()
  );
  const result = await runChecks(selectedChecks);

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    uptime: Math.floor(uptime()),
    timestamp: now(),
    dependencies: result.dependencies,
  };
}

module.exports = {
  getHealthStatus,
  pingMongo,
};
