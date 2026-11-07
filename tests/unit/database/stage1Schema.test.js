const assert = require('node:assert/strict');
const test = require('node:test');
const {ensureStage1Schema} = require('../../../src/database/stage1Schema');

test('Stage 1 schema is additive and creates PostgreSQL-owned graph and search outbox support', async () => {
  const statements = [];
  const sql = async (strings, ...values) => {
    statements.push({text: strings.join('?'), values});
    return [];
  };

  await ensureStage1Schema(sql);
  const text = statements.map(statement => statement.text).join('\n');
  assert.match(text, /create table if not exists user_graph_outbox/i);
  assert.match(text, /create table if not exists user_search_outbox/i);
  assert.doesNotMatch(text, /user_index_outbox/i);
  assert.doesNotMatch(text, /user_follows|follow_requests|user_blocks|user_mutes/i);
  assert.match(text, /alter table notification_devices add column if not exists capabilities/i);
  assert.match(text, /idx_users_profile_username_prefix/i);
  assert.match(text, /idx_users_profile_name_prefix/i);
  assert.doesNotMatch(text, /drop table|drop column|truncate/i);
});
