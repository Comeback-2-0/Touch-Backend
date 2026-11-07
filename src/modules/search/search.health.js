const {getPostgresClient, pingPostgres} = require('../../database/postgresClient');
const {getNeo4jDriver, verifyNeo4jConnectivity} = require('../../database/neo4jClient');

async function checkDependency(dependencies, name, check) {
  try {
    const result = await check();
    dependencies[name] = result === false ? 'error' : 'ok';
    return result !== false;
  } catch (_) {
    dependencies[name] = 'error';
    return false;
  }
}

async function getSearchHealthStatus({
  postgresPing = () => pingPostgres(getPostgresClient()),
  graphPing = () => verifyNeo4jConnectivity(getNeo4jDriver()),
} = {}) {
  const dependencies = {};
  const postgresOk = await checkDependency(dependencies, 'postgres', postgresPing);
  const neo4jOk = await checkDependency(dependencies, 'neo4j', graphPing);
  return {ok: postgresOk && neo4jOk, dependencies};
}

module.exports = {getSearchHealthStatus};
