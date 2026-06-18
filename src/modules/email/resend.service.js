const RESEND_EMAILS_URL = 'https://api.resend.com/emails';

function httpError(message, statusCode, providerMessage) {
  return Object.assign(new Error(message), {statusCode, providerMessage});
}

function redact(value, secret) {
  if (!value || !secret) return value || '';
  return String(value).split(secret).join('[redacted]');
}

function createResendEmailService({
  env = process.env,
  fetchImpl = global.fetch,
} = {}) {
  async function sendEmail(email) {
    const apiKey = env.RESEND_API_KEY;

    if (!apiKey) {
      if (env.NODE_ENV === 'production') {
        throw httpError('RESEND_API_KEY is required to send email', 500);
      }
      return {skipped: true};
    }

    if (typeof fetchImpl !== 'function') {
      throw httpError('Email transport is unavailable', 500);
    }

    const response = await fetchImpl(RESEND_EMAILS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: email.from,
        to: Array.isArray(email.to) ? email.to : [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });

    if (!response.ok) {
      const providerText = typeof response.text === 'function' ? await response.text() : '';
      throw httpError(
        'Email provider request failed',
        response.status || 500,
        redact(providerText, apiKey),
      );
    }

    if (typeof response.json !== 'function') {
      return {sent: true};
    }

    return response.json();
  }

  return {sendEmail};
}

module.exports = {
  createResendEmailService,
};
