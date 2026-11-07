const test = require('node:test');
const assert = require('node:assert/strict');
const {createPostgresSearchRepository} = require('../../../src/modules/search/postgres-search.repository');

test('PostgreSQL search uses indexed username and name prefixes without application scans', async () => {
  let captured;
  const sql = (strings, ...values) => {
    captured = {text: strings.join('?'), values};
    return Promise.resolve([
      {id: 'u1', username: 'roy_be', name: 'Roy Be', profile_picture: 'p', updated_at: new Date('2026-01-01T00:00:00Z')},
    ]);
  };
  const repository = createPostgresSearchRepository(sql);

  const result = await repository.searchPeople({query: 'roy', viewerId: 'viewer', mode: 'full', limit: 20, offset: 0});

  assert.equal(repository.authoritative, true);
  assert.equal(result.items[0].userId, 'u1');
  assert.match(captured.text, /lower\(username\)/i);
  assert.match(captured.text, /lower\(name\)/i);
  assert.match(captured.text, /like/i);
  assert.match(captured.text, /limit/i);
  assert.ok(captured.values.includes('roy'));
});

test('PostgreSQL search applies a short transaction statement timeout', async () => {
  const statements = [];
  const rows = [{id: 'u1', username: 'roy_be', name: 'Roy Be', profile_picture: '', updated_at: null}];
  const tag = (strings, ...values) => {
    statements.push({text: strings.join('?'), values});
    return Promise.resolve(statements.length === 1 ? [] : rows);
  };
  const sql = () => Promise.resolve(rows);
  sql.begin = async callback => callback(tag);

  await createPostgresSearchRepository(sql).searchPeople({query: 'roy', viewerId: 'viewer'});

  assert.match(statements[0].text, /set_config\(['"]statement_timeout['"]/i);
  assert.ok(Number(statements[0].values[0]) > 0);
});

test('PostgreSQL search escapes SQL LIKE wildcards from user input', async () => {
  let captured;
  const sql = (strings, ...values) => {
    captured = {text: strings.join('?'), values};
    return Promise.resolve([]);
  };

  await createPostgresSearchRepository(sql).searchPeople({query: 'r%_', viewerId: 'viewer'});

  assert.match(captured.text, /escape/i);
  assert.ok(captured.values.includes('r\\%\\_%'));
});
