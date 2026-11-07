const {getPostgresClient, pingPostgres} = require('../../database/postgresClient');
const {getNeo4jDriver, verifyNeo4jConnectivity} = require('../../database/neo4jClient');
const {createOpenSearchSearchRepository} = require('./opensearch-search.repository');

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
  opensearchPing = () => createOpenSearchSearchRepository().ping(),
  postgresPing = () => pingPostgres(getPostgresClient()),
  graphPing = () => verifyNeo4jConnectivity(getNeo4jDriver()),
} = {}) {
  const dependencies = {};
  const opensearchOk = await checkDependency(dependencies, 'opensearch', opensearchPing);
  const postgresOk = await checkDependency(dependencies, 'postgresFallback', postgresPing);
  const neo4jOk = await checkDependency(dependencies, 'neo4j', graphPing);
  const degraded = !opensearchOk;
  return {
    ok: (opensearchOk || postgresOk) && neo4jOk,
    degraded,
    dependencies,
  };
}

module.exports = {getSearchHealthStatus};
