const test = require('node:test');
const assert = require('node:assert/strict');
const {
  workingDayDeadline,
  createAccountDeletionService,
} = require('../../../src/modules/users/account-deletion.service');
test('14 working days excludes weekends and returns an India-local deadline', () => {
  assert.equal(
    workingDayDeadline(new Date('2026-10-23T20:00:00Z')),
    '2026-11-12T18:29:59.999Z',
  );
});
test('request is saved before admin email; retry keeps original deadline', async () => {
  let saved;
  let fail = true;
  let sent = 0;
  const users = {
    findById: async () => ({id: 'u1', email: 'a@example.com', name: 'A'}),
    requestDeletion: async (id, value) => {
      saved ||= value;
      return {id, email: 'a@example.com', deletionRequest: saved};
    },
    markDeletionEmailSent: async () => {
      sent++;
    },
  };
  const service = createAccountDeletionService({
    users,
    now: () => new Date('2026-10-23T10:00:00Z'),
    sendAdminEmail: async () => {
      assert.ok(saved);
      if (fail) throw Error('mail unavailable');
    },
  });
  const first = await service.request('u1', {
    confirmed: true,
    reason: 'Other',
    details: 'Optional',
  });
  assert.equal(first.status, 'pending');
  assert.equal(sent, 0);
  fail = false;
  const second = await service.request('u1', {confirmed: true});
  assert.equal(first.dueAt, second.dueAt);
  assert.equal(sent, 1);
});
test('confirmation and feedback limits are enforced', async () => {
  const service = createAccountDeletionService({users: {}});
  await assert.rejects(service.request('u1', {}), /confirm/i);
  await assert.rejects(
    service.request('u1', {confirmed: true, details: 'x'.repeat(2001)}),
    /2000/,
  );
});
