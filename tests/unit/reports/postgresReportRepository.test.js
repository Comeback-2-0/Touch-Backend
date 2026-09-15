const assert = require('node:assert/strict');
const test = require('node:test');

const { createPostgresReportRepository } = require('../../../src/modules/reports/postgres-report.repository');

function row(overrides = {}) {
  return {
    id: 'report-1',
    reporter_id: 'user-1',
    target_type: 'post',
    target_id: 'post-1',
    reason: 'spam',
    status: 'open',
    metadata: { details: 'Bad post', targetOwnerId: 'author-1' },
    created_at: new Date('2026-06-22T00:00:00.000Z'),
    updated_at: new Date('2026-06-22T00:00:00.000Z'),
    ...overrides,
  };
}

function createSql({ existingActive = null, count = 1 } = {}) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join('?');
    calls.push({ text, values });

    if (/select \* from reports/i.test(text)) {
      return existingActive ? [existingActive] : [];
    }

    if (/insert into reports/i.test(text)) {
      return [row({ id: values[0], metadata: values[5] })];
    }

    if (/update reports/i.test(text)) {
      return [row({ status: 'withdrawn' })];
    }

    if (/count\(\*\)/i.test(text)) {
      return [{ count }];
    }

    return [];
  };
  return { sql, calls };
}

test('creates a PostgreSQL report with metadata and created flag', async () => {
  const { sql, calls } = createSql();
  const repository = createPostgresReportRepository(sql, () => 'report-1');

  const result = await repository.createActiveReport({
    reporterId: 'user-1',
    targetType: 'post',
    targetId: 'post-1',
    reason: 'spam',
    metadata: { details: 'Bad post', targetOwnerId: 'author-1' },
  });

  assert.equal(result.created, true);
  assert.equal(result.report.id, 'report-1');
  assert.deepEqual(result.report.metadata, { details: 'Bad post', targetOwnerId: 'author-1' });
  assert.equal(calls.filter(call => /insert into reports/i.test(call.text)).length, 1);
});

test('duplicate active reports return the existing report without inserting', async () => {
  const { sql, calls } = createSql({ existingActive: row() });
  const repository = createPostgresReportRepository(sql, () => 'new-report');

  const result = await repository.createActiveReport({
    reporterId: 'user-1',
    targetType: 'post',
    targetId: 'post-1',
    reason: 'spam',
  });

  assert.equal(result.created, false);
  assert.equal(result.report.id, 'report-1');
  assert.equal(calls.some(call => /insert into reports/i.test(call.text)), false);
});

test('withdraws active reports and counts open reports for a target', async () => {
  const { sql } = createSql({ count: '2' });
  const repository = createPostgresReportRepository(sql);

  const withdrawn = await repository.withdrawActiveReport({
    reporterId: 'user-1',
    targetType: 'post',
    targetId: 'post-1',
  });
  const count = await repository.countOpenReports({
    targetType: 'post',
    targetId: 'post-1',
  });

  assert.equal(withdrawn.withdrawn, true);
  assert.equal(withdrawn.report.status, 'withdrawn');
  assert.equal(count, 2);
});
