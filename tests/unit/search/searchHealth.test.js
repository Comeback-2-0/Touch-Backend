const assert = require('node:assert/strict');
const test = require('node:test');
const {getSearchHealthStatus} = require('../../../src/modules/search/search.health');

test('search readiness reports OpenSearch primary, PostgreSQL fallback, and Neo4j healthy', async () => {
  const result = await getSearchHealthStatus({opensearchPing: async () => true, postgresPing: async () => true, graphPing: async () => true});

  assert.deepEqual(result, {ok: true, degraded: false, dependencies: {opensearch: 'ok', postgresFallback: 'ok', neo4j: 'ok'}});
});

test('search readiness remains available but reports degraded when OpenSearch is down and PostgreSQL fallback is healthy', async () => {
  const result = await getSearchHealthStatus({opensearchPing: async () => { throw new Error('private credential or URL'); }, postgresPing: async () => true, graphPing: async () => true});

  assert.deepEqual(result, {ok: true, degraded: true, dependencies: {opensearch: 'error', postgresFallback: 'ok', neo4j: 'ok'}});
  assert.doesNotMatch(JSON.stringify(result), /credential|URL|private/i);
});

test('search readiness is unavailable when both search providers are down', async () => {
  const result = await getSearchHealthStatus({opensearchPing: async () => false, postgresPing: async () => false, graphPing: async () => true});

  assert.deepEqual(result, {ok: false, degraded: true, dependencies: {opensearch: 'error', postgresFallback: 'error', neo4j: 'ok'}});
});

test('search readiness is unavailable when Neo4j is down even if a search provider is healthy', async () => {
  const result = await getSearchHealthStatus({opensearchPing: async () => true, postgresPing: async () => true, graphPing: async () => { throw new Error('private credential or URL'); }});

  assert.deepEqual(result, {ok: false, degraded: false, dependencies: {opensearch: 'ok', postgresFallback: 'ok', neo4j: 'error'}});
  assert.doesNotMatch(JSON.stringify(result), /credential|URL|private/i);
});
