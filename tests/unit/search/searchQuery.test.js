const test = require('node:test');
const assert = require('node:assert/strict');
const {normalizeQuery, encodeCursor, decodeCursor} = require('../../../src/modules/search/search-query');

test('normalizes people search input and removes a leading at sign', () => {
  assert.equal(normalizeQuery('  @Roy   Be  '), 'roy be');
});

test('honors the bounded deployment query-length setting', () => {
  const previous = process.env.SEARCH_MAX_QUERY_LENGTH;
  process.env.SEARCH_MAX_QUERY_LENGTH = '8';
  try {
    assert.throws(() => normalizeQuery('123456789'), error => error.code === 'SEARCH_QUERY_INVALID');
  } finally {
    if (previous === undefined) delete process.env.SEARCH_MAX_QUERY_LENGTH;
    else process.env.SEARCH_MAX_QUERY_LENGTH = previous;
  }
});

test('cursor encoding contains only a bounded PostgreSQL offset and query', () => {
  const cursor = encodeCursor({type: 'postgres', offset: 20, query: 'roy'});
  assert.deepEqual(decodeCursor(cursor), {type: 'postgres', offset: 20, query: 'roy'});
});

test('rejects oversized or structurally unsafe cursors', () => {
  assert.throws(() => decodeCursor('x'.repeat(2049)), error => error.code === 'SEARCH_CURSOR_INVALID');
  assert.throws(() => decodeCursor(encodeCursor({type: 'fallback', offset: 20})), error => error.code === 'SEARCH_CURSOR_INVALID');
  assert.throws(() => decodeCursor(encodeCursor({type: 'fallback', offset: 100001})), error => error.code === 'SEARCH_CURSOR_INVALID');
  assert.throws(() => decodeCursor(encodeCursor({type: 'external', offset: 20, query: 'roy'})), error => error.code === 'SEARCH_CURSOR_INVALID');
});
