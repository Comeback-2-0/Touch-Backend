const assert = require('node:assert/strict');
const test = require('node:test');

const { ensurePostgresSchema } = require('../../../src/database/postgresSchema');

test('postgres schema owns transactional tables only', async () => {
  const statements = [];
  const sql = async (strings, ...values) => {
    statements.push({ text: strings.join('?'), values });
    return [];
  };

  await ensurePostgresSchema(sql);

  const schemaSql = statements.map(statement => statement.text).join('\n');
  assert.match(schemaSql, /create table if not exists users/i);
  assert.match(schemaSql, /create table if not exists refresh_sessions/i);
  assert.match(schemaSql, /create table if not exists communities/i);
  assert.match(schemaSql, /create table if not exists community_memberships/i);
  assert.match(schemaSql, /create table if not exists notification_preferences/i);
  assert.match(schemaSql, /create table if not exists reports/i);
  assert.match(schemaSql, /create unique index if not exists idx_reports_active_unique/i);
  assert.match(schemaSql, /where status = 'open'/i);
  assert.match(schemaSql, /create table if not exists moderation_reviews/i);
  assert.match(schemaSql, /create table if not exists subscriptions/i);
  assert.doesNotMatch(schemaSql, /post_view_events/i);
  assert.doesNotMatch(schemaSql, /feed_impression_events/i);
  assert.doesNotMatch(schemaSql, /likes\s*\(/i);
  assert.doesNotMatch(schemaSql, /saves\s*\(/i);
});
