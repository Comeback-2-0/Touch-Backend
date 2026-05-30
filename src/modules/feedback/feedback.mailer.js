const nodemailer = require('nodemailer');

function hasSmtpConfig() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransporter() {
  if (!hasSmtpConfig()) return null;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function buildText(payload) {
  const lines = [
    `${payload.type} submitted on Touch`,
    '',
    `User ID: ${payload.userId}`,
    `User Email: ${payload.userEmail || 'Not available'}`,
    '',
    payload.title ? `Title: ${payload.title}` : null,
    payload.whatHappened ? `What happened: ${payload.whatHappened}` : null,
    payload.description ? `Description: ${payload.description}` : null,
    payload.stepsToReproduce ? `Steps to reproduce: ${payload.stepsToReproduce}` : null,
    payload.screenshotUrl ? `Screenshot: ${payload.screenshotUrl}` : null,
  ].filter(Boolean);

  return lines.join('\n');
}

async function sendFeedbackEmail(payload) {
  const transporter = createTransporter();
  if (!transporter) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('Feedback email skipped: SMTP environment is not configured');
    }
    return { skipped: true };
  }

  const to = process.env.FEEDBACK_EMAIL_TO || 'ijroy037@gmail.com';
  const from = process.env.FEEDBACK_EMAIL_FROM || process.env.SMTP_USER;

  return transporter.sendMail({
    from,
    to,
    subject: `Touch ${payload.type}: ${payload.title || payload.whatHappened}`,
    text: buildText(payload),
  });
}

module.exports = {
  sendFeedbackEmail,
};
