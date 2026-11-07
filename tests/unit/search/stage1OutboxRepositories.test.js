const assert = require('node:assert/strict');
const test = require('node:test');
const {createUserGraphOutboxRepository} = require('../../../src/modules/graph/user-graph-outbox.repository');

function createSql() {
  const queries = [];
  const sql = (strings, ...values) => {
    queries.push({text: strings.join(' '), values});
    return Promise.resolve([]);
  };
  sql.json = value => value;
  return {sql, queries};
}

test('user graph outbox reclaims stale processing events', async () => {
  const {sql, queries} = createSql();
  await createUserGraphOutboxRepository(sql).listPending();

  assert.match(queries[0].text, /update user_graph_outbox/);
  assert.match(queries[0].text, /status='retry'/);
  assert.match(queries[0].text, /status='processing'/);
  assert.match(queries[0].text, /interval '5 minutes'/);
});
