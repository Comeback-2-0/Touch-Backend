const {createResendEmailService} = require('./resend.service');
const {
  buildWelcomeEmail,
  buildProfileCompletedEmail,
  buildBugReportConfirmationEmail,
  buildFeatureSuggestionConfirmationEmail,
  buildAdminFeedbackEmail,
} = require('./email.templates');

const resend = createResendEmailService();

function adminFeedbackRecipient() {
  return process.env.FEEDBACK_EMAIL_TO || 'ijroy037@gmail.com';
}

function sendWelcomeEmail(payload, transport = resend) {
  return transport.sendEmail(buildWelcomeEmail(payload));
}

function sendProfileCompletedEmail(payload, transport = resend) {
  return transport.sendEmail(buildProfileCompletedEmail(payload));
}

async function sendBugReportEmails(payload, transport = resend) {
  const results = [];

  if (payload.userEmail) {
    results.push(await transport.sendEmail(buildBugReportConfirmationEmail({
      to: payload.userEmail,
      name: payload.userName,
      summary: payload.whatHappened,
    })));
  }

  results.push(await transport.sendEmail(buildAdminFeedbackEmail({
    ...payload,
    to: adminFeedbackRecipient(),
    type: 'Bug Report',
  })));

  return results;
}

async function sendFeatureRequestEmails(payload, transport = resend) {
  const results = [];

  if (payload.userEmail) {
    results.push(await transport.sendEmail(buildFeatureSuggestionConfirmationEmail({
      to: payload.userEmail,
      name: payload.userName,
      title: payload.title,
      description: payload.description,
    })));
  }

  results.push(await transport.sendEmail(buildAdminFeedbackEmail({
    ...payload,
    to: adminFeedbackRecipient(),
    type: 'Feature Request',
  })));

  return results;
}

async function sendAccountDeletionAdminEmail(payload) {
  const lines = [
    `Account ID: ${payload.userId}`, `Name: ${payload.name || ''}`, `Email: ${payload.email || ''}`,
    `Requested: ${payload.requestedAt}`, `Delete by: ${payload.dueAt} (14 working days; Monday-Friday, Asia/Kolkata)`,
    `Reason: ${payload.reason || 'Skipped'}`, `Details: ${payload.details || 'Skipped'}`,
    'Manual action required: delete the account and associated personal data/content, revoke provider credentials where applicable, and confirm completion to the user.',
  ];
  return resend.sendEmail({from:'Touch Support <support-touch@dophera.tech>', to:adminFeedbackRecipient(), subject:`Touch account deletion request: ${payload.userId}`, text:lines.join('\n')});
}

module.exports = {
  sendAccountDeletionAdminEmail,
  sendWelcomeEmail,
  sendProfileCompletedEmail,
  sendBugReportEmails,
  sendFeatureRequestEmails,
};
