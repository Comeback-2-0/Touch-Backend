const assert = require('node:assert/strict');
const test = require('node:test');
const {getSearchHealthStatus} = require('../../../src/modules/search/search.health');

test('search readiness reports PostgreSQL and Neo4j as healthy without exposing configuration', async () => {
  const result = await getSearchHealthStatus({postgresPing: async () => true, graphPing: async () => true});

  assert.deepEqual(result, {ok: true, dependencies: {postgres: 'ok', neo4j: 'ok'}});
});

test('search readiness reports a safe degraded result when PostgreSQL is unavailable', async () => {
  const result = await getSearchHealthStatus({postgresPing: async () => { throw new Error('private credential or URL'); }, graphPing: async () => true});

  assert.deepEqual(result, {ok: false, dependencies: {postgres: 'error', neo4j: 'ok'}});
  assert.doesNotMatch(JSON.stringify(result), /credential|URL|private/i);
});

test('search readiness reports a safe degraded result when Neo4j is unavailable', async () => {
  const result = await getSearchHealthStatus({postgresPing: async () => true, graphPing: async () => { throw new Error('private credential or URL'); }});

  assert.deepEqual(result, {ok: false, dependencies: {postgres: 'ok', neo4j: 'error'}});
  assert.doesNotMatch(JSON.stringify(result), /credential|URL|private/i);
});
