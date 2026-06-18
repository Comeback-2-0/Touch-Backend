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

module.exports = {
  sendWelcomeEmail,
  sendProfileCompletedEmail,
  sendBugReportEmails,
  sendFeatureRequestEmails,
};
