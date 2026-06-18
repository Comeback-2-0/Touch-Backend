const emailService = require('../email/email.service');

function sendBugReportEmails(payload) {
  return emailService.sendBugReportEmails(payload);
}

function sendFeatureRequestEmails(payload) {
  return emailService.sendFeatureRequestEmails(payload);
}

function sendFeedbackEmail(payload) {
  if (payload.type === 'Feature Request') {
    return sendFeatureRequestEmails(payload);
  }
  return sendBugReportEmails(payload);
}

module.exports = {
  sendFeedbackEmail,
  sendBugReportEmails,
  sendFeatureRequestEmails,
};
