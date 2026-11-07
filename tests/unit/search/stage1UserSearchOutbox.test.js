const assert = require('node:assert/strict');
const test = require('node:test');

const {createUserSearchOutboxRepository} = require('../../../src/modules/search/user-search-outbox.repository');
const {createStage1UserSearchOutboxRunner} = require('../../../src/jobs/stage1UserSearchOutbox');

test('user search outbox writes idempotent index events and claims retryable rows', async () => {
  const statements = [];
  const sql = async (strings, ...values) => {
    statements.push({text: strings.join('?'), values});
    return [];
  };
  sql.json = value => value;
  const repository = createUserSearchOutboxRepository(sql);

  await repository.enqueue({eventId: 'event-1', userId: 'user-1', operation: 'upsert', payload: {username: 'roy'}});
  await repository.listPending(10);
  await repository.claim('event-1');
  await repository.markDone('event-1');
  await repository.markFailed('event-1');

  const text = statements.map(statement => statement.text).join('\n');
  assert.match(text, /insert into user_search_outbox/i);
  assert.match(text, /status in \('pending',\s*'retry'\)/i);
  assert.match(text, /status\s*=\s*'processing'/i);
  assert.match(text, /status\s*=\s*'delivered'/i);
  assert.match(text, /status\s*=\s*'retry'/i);
});

test('search outbox runner upserts active users and deletes inactive users', async () => {
  const rows = [
    {id: 'upsert-1', user_id: 'upsert-1', operation: 'upsert', payload: {name: 'Roy', username: 'roy', accountActive: true}},
    {id: 'delete-1', user_id: 'delete-1', operation: 'delete', payload: {accountActive: false}},
  ];
  const calls = [];
  const repository = {
    async listPending() { return rows; },
    async claim() { return true; },
    async markDone(id) { calls.push(['done', id]); },
    async markFailed(id) { calls.push(['failed', id]); },
  };
  const search = {
    async upsertUser(user) { calls.push(['upsert', user.id, user.username]); },
    async deleteUser(userId) { calls.push(['delete', userId]); },
  };

  await createStage1UserSearchOutboxRunner({repository, search})();

  assert.deepEqual(calls, [
    ['upsert', 'upsert-1', 'roy'],
    ['done', 'upsert-1'],
    ['delete', 'delete-1'],
    ['done', 'delete-1'],
  ]);
});

test('search outbox runner leaves failed OpenSearch work retryable', async () => {
  const calls = [];
  const repository = {
    async listPending() { return [{id: 'event-1', user_id: 'user-1', operation: 'upsert', payload: {}}]; },
    async claim() { return true; },
    async markDone() { calls.push('done'); },
    async markFailed(id) { calls.push(['failed', id]); },
  };
  const search = {async upsertUser() { throw new Error('OpenSearch down'); }};

  await createStage1UserSearchOutboxRunner({repository, search, logger: {warn() {}}})();

  assert.deepEqual(calls, [['failed', 'event-1']]);
});
