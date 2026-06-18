const assert = require('node:assert/strict');
const test = require('node:test');

const { createResendEmailService } = require('../../../src/modules/email/resend.service');

test('resend service skips sends when api key is missing outside production', async () => {
  const calls = [];
  const service = createResendEmailService({
    env: {NODE_ENV: 'development'},
    fetchImpl: async () => {
      calls.push('fetch');
    },
  });

  const result = await service.sendEmail({
    from: 'Touch <hello-touch@dophera.tech>',
    to: 'maya@example.com',
    subject: 'Welcome to Touch',
    html: '<p>Hello</p>',
    text: 'Hello',
  });

  assert.deepEqual(result, {skipped: true});
  assert.deepEqual(calls, []);
});

test('resend service posts expected payload without exposing the api key', async () => {
  const calls = [];
  const service = createResendEmailService({
    env: {NODE_ENV: 'production', RESEND_API_KEY: 'secret-key'},
    fetchImpl: async (url, options) => {
      calls.push({url, options});
      return {
        ok: true,
        async json() {
          return {id: 'email-1'};
        },
      };
    },
  });

  const result = await service.sendEmail({
    from: 'Touch <hello-touch@dophera.tech>',
    to: 'maya@example.com',
    subject: 'Welcome to Touch',
    html: '<p>Hello</p>',
    text: 'Hello',
  });

  assert.deepEqual(result, {id: 'email-1'});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret-key');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    from: 'Touch <hello-touch@dophera.tech>',
    to: ['maya@example.com'],
    subject: 'Welcome to Touch',
    html: '<p>Hello</p>',
    text: 'Hello',
  });
});

test('resend service throws a client-safe error without leaking the api key', async () => {
  const service = createResendEmailService({
    env: {NODE_ENV: 'production', RESEND_API_KEY: 'secret-key'},
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      async text() {
        return 'secret-key is invalid';
      },
    }),
  });

  await assert.rejects(
    () => service.sendEmail({
      from: 'Touch <hello-touch@dophera.tech>',
      to: 'maya@example.com',
      subject: 'Welcome to Touch',
      html: '<p>Hello</p>',
      text: 'Hello',
    }),
    err => {
      assert.equal(err.message, 'Email provider request failed');
      assert.equal(err.statusCode, 403);
      assert.equal(String(err.providerMessage).includes('secret-key'), false);
      return true;
    },
  );
});
