const assert = require('node:assert/strict');
const test = require('node:test');
const {createSearchService} = require('../../../src/modules/search/search.service');
const {encodeCursor, decodeCursor} = require('../../../src/modules/search/search-query');

function repositoryWith(items, {nextOffset = null, authoritative = true, capture} = {}) {
  return {
    authoritative,
    async searchPeople(input) {
      capture?.(input);
      return {items, nextOffset};
    },
  };
}

test('search service uses OpenSearch as the primary provider', async () => {
  let captured;
  const service = createSearchService({
    openSearchRepository: repositoryWith([
      {userId: 'u2', name: 'Roy Be', username: 'roy_be', profilePhoto: 'p', secret: 'hidden'},
    ], {capture: input => { captured = input; }}),
    postgresSearchRepository: repositoryWith([]),
    socialRepository: {async blockedUserIds() { return []; }},
  });

  const result = await service.people({viewerId: 'u1', query: 'roy', mode: 'suggest'});

  assert.deepEqual(result.items, [{userId: 'u2', username: 'roy_be', name: 'Roy Be', profilePhoto: 'p'}]);
  assert.deepEqual(captured, {viewerId: 'u1', query: 'roy', mode: 'suggest', limit: 8, offset: 0});
  assert.equal(result.nextCursor, null);
});

test('OpenSearch zero results do not query PostgreSQL', async () => {
  let postgresCalls = 0;
  const service = createSearchService({
    openSearchRepository: repositoryWith([]),
    postgresSearchRepository: {async searchPeople() { postgresCalls += 1; return {items: []}; }},
  });

  const result = await service.people({viewerId: 'u1', query: 'roy', mode: 'full'});

  assert.deepEqual(result.items, []);
  assert.equal(postgresCalls, 0);
});

test('search service falls back to PostgreSQL only when OpenSearch is unavailable', async () => {
  let postgresCalls = 0;
  const service = createSearchService({
    openSearchRepository: {async searchPeople() { throw Object.assign(new Error('down'), {code: 'OPENSEARCH_UNAVAILABLE', fallbackAllowed: true}); }},
    postgresSearchRepository: {
      async searchPeople(input) { postgresCalls += 1; assert.equal(input.query, 'roy'); return {items: [{userId: 'u2'}]}; },
    },
  });

  const result = await service.people({viewerId: 'u1', query: 'roy', mode: 'full'});

  assert.deepEqual(result.items, [{userId: 'u2', username: '', name: '', profilePhoto: ''}]);
  assert.equal(postgresCalls, 1);
});

test('search service does not fall back for a non-availability OpenSearch failure', async () => {
  let postgresCalls = 0;
  const service = createSearchService({
    openSearchRepository: {async searchPeople() { throw Object.assign(new Error('bad request'), {code: 'OPENSEARCH_REQUEST_FAILED', fallbackAllowed: false}); }},
    postgresSearchRepository: {async searchPeople() { postgresCalls += 1; return {items: []}; }},
  });

  await assert.rejects(
    service.people({viewerId: 'u1', query: 'roy', mode: 'full'}),
    error => error.code === 'SEARCH_UNAVAILABLE' && error.statusCode === 503,
  );
  assert.equal(postgresCalls, 0);
});

test('search service returns a safe unavailable error when the fallback PostgreSQL search fails', async () => {
  const service = createSearchService({
    openSearchRepository: {async searchPeople() { throw Object.assign(new Error('PostgreSQL down'), {code: 'OPENSEARCH_UNAVAILABLE', fallbackAllowed: true}); }},
    postgresSearchRepository: {async searchPeople() { throw new Error('PostgreSQL down'); }},
  });

  await assert.rejects(
    service.people({viewerId: 'u1', query: 'roy', mode: 'full'}),
    error => error.code === 'SEARCH_UNAVAILABLE' && error.statusCode === 503,
  );
});

test('search results still remove accounts blocked in either direction', async () => {
  const service = createSearchService({
    openSearchRepository: repositoryWith([{userId: 'blocked'}, {userId: 'visible'}]),
    socialRepository: {async blockedUserIds() { return ['blocked']; }},
  });

  const result = await service.people({viewerId: 'viewer', query: 'ro', mode: 'suggest'});

  assert.deepEqual(result.items.map(item => item.userId), ['visible']);
});

test('non-authoritative injected repositories still receive the active-account filter', async () => {
  const service = createSearchService({
    openSearchRepository: {
      authoritative: false,
      async searchPeople() { return {items: [{userId: 'deactivated'}, {userId: 'visible'}]}; },
      async activeUserIds(ids) {
        assert.deepEqual(ids, ['deactivated', 'visible']);
        return ['visible'];
      },
    },
    socialRepository: {async relationship() { return {isBlocked: false, state: 'none'}; }},
  });

  const result = await service.people({viewerId: 'viewer', query: 'ro', mode: 'suggest'});

  assert.deepEqual(result.items.map(item => item.userId), ['visible']);
});

test('authoritative visibility failure returns retry and the next request retries OpenSearch', async () => {
  let repositoryCalls = 0;
  const service = createSearchService({
    openSearchRepository: {
      authoritative: true,
      async searchPeople() {
        repositoryCalls += 1;
        return {items: [{userId: 'visible'}]};
      },
    },
    socialRepository: {async blockedUserIds() { throw new Error('Neo4j unavailable'); }},
  });

  await assert.rejects(service.people({viewerId: 'viewer', query: 'ro'}), {code: 'SEARCH_UNAVAILABLE', statusCode: 503});
  await assert.rejects(service.people({viewerId: 'viewer', query: 'ro'}), {code: 'SEARCH_UNAVAILABLE', statusCode: 503});
  assert.equal(repositoryCalls, 2);
});

test('OpenSearch search returns an opaque provider cursor for the next page', async () => {
  const calls = [];
  const service = createSearchService({
    openSearchRepository: repositoryWith([{userId: 'u1'}], {nextOffset: 8, capture: input => calls.push(input)}),
  });

  const first = await service.people({viewerId: 'viewer', query: 'ro', mode: 'suggest'});
  const cursor = decodeCursor(first.nextCursor);

  assert.deepEqual(cursor, {type: 'opensearch', offset: 8, query: 'ro'});
  assert.equal(calls[0].offset, 0);
});

test('rejects a cursor created for a different query before touching PostgreSQL', async () => {
  let calls = 0;
  const service = createSearchService({
    openSearchRepository: {async searchPeople() { calls += 1; return {items: []}; }},
  });

  await assert.rejects(
    service.people({
      viewerId: 'u1',
      query: 'riya',
      mode: 'full',
      cursor: encodeCursor({type: 'postgres', offset: 20, query: 'roy'}),
    }),
    error => error.code === 'SEARCH_CURSOR_INVALID' && error.statusCode === 400,
  );
  assert.equal(calls, 0);
});

test('invalid queries fail without calling the repository', async () => {
  let calls = 0;
  const service = createSearchService({
    openSearchRepository: {async searchPeople() { calls += 1; return {items: []}; }},
  });

  await assert.rejects(
    service.people({viewerId: 'u1', query: 'r', mode: 'suggest'}),
    error => error.code === 'SEARCH_QUERY_INVALID' && error.statusCode === 400,
  );
  assert.equal(calls, 0);
});
