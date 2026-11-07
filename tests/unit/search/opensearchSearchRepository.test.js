const assert = require('node:assert/strict');
const test = require('node:test');

const {createOpenSearchSearchRepository} = require('../../../src/modules/search/opensearch-search.repository');

function response(body, {status = 200} = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

test('OpenSearch people search sends a bounded exact/prefix query and maps hits', async () => {
  let request;
  const repository = createOpenSearchSearchRepository({
    url: 'https://search.example.com',
    index: 'touch-users-v1',
    apiKey: 'test-api-key',
    fetchImpl: async (url, options) => {
      request = {url, options};
      return response({hits: {hits: [{_id: 'u2', _source: {userId: 'u2', username: 'roy_be', name: 'Roy Be', profilePhoto: 'p'}}]}});
    },
  });

  const result = await repository.searchPeople({viewerId: 'u1', query: 'roy', limit: 8, offset: 0});

  assert.deepEqual(result.items, [{userId: 'u2', username: 'roy_be', name: 'Roy Be', profilePhoto: 'p'}]);
  assert.equal(result.nextOffset, null);
  assert.match(request.url, /touch-users-v1\/_search$/);
  const body = JSON.parse(request.options.body);
  assert.equal(body.size, 9);
  assert.equal(body.from, 0);
  assert.equal(body.query.bool.minimum_should_match, 1);
  assert.match(request.options.headers.authorization || '', /^ApiKey /);
});

test('OpenSearch strips embedded URL credentials and sends basic authentication separately', async () => {
  let request;
  const repository = createOpenSearchSearchRepository({
    url: 'https://avnadmin:secret%40value@search.example.com:19323',
    index: 'touch-users-v1',
    fetchImpl: async (url, options) => {
      request = {url, options};
      return response({hits: {hits: []}});
    },
  });

  await repository.searchPeople({viewerId: 'u1', query: 'roy'});

  assert.equal(request.url, 'https://search.example.com:19323/touch-users-v1/_search');
  assert.equal(request.options.headers.authorization, `Basic ${Buffer.from('avnadmin:secret@value').toString('base64')}`);
});

test('OpenSearch availability failures are explicitly classified for fallback', async () => {
  const repository = createOpenSearchSearchRepository({
    url: 'https://search.example.com',
    fetchImpl: async () => response({error: 'down'}, {status: 503}),
  });

  await assert.rejects(
    repository.searchPeople({viewerId: 'u1', query: 'roy'}),
    error => error.code === 'OPENSEARCH_UNAVAILABLE' && error.fallbackAllowed === true,
  );
});

test('OpenSearch authentication failures are not classified as instance downtime', async () => {
  const repository = createOpenSearchSearchRepository({
    url: 'https://search.example.com',
    fetchImpl: async () => response({error: 'unauthorized'}, {status: 401}),
  });

  await assert.rejects(
    repository.searchPeople({viewerId: 'u1', query: 'roy'}),
    error => error.code === 'OPENSEARCH_REQUEST_FAILED' && error.fallbackAllowed === false,
  );
});

test('missing OpenSearch configuration is not treated as instance downtime', async () => {
  const repository = createOpenSearchSearchRepository({url: '', fetchImpl: async () => response({})});

  await assert.rejects(
    repository.searchPeople({viewerId: 'u1', query: 'roy'}),
    error => error.code === 'OPENSEARCH_REQUEST_FAILED' && error.fallbackAllowed === false,
  );
});
