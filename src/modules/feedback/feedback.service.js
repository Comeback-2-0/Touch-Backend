const BugReport = require('./bug-report.model');
const FeatureRequest = require('./feature-request.model');
const defaultMailer = require('./feedback.mailer');
const cloudinaryStorage = require('../../storage/cloudinary');
const { ALLOWED_IMAGE_TYPES, MAX_PROFILE_IMAGE_BYTES } = require('../uploads/upload.service');

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function requiredString(value, fieldName) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw httpError(`${fieldName} is required`, 400);
  }
  return normalized;
}

function validateScreenshot(file) {
  if (!file) return;
  if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
    throw httpError('Screenshot must be a JPEG, PNG, or WebP image', 400);
  }
  if (file.size > MAX_PROFILE_IMAGE_BYTES) {
    throw httpError('Screenshot must be 5 MB or smaller', 400);
  }
}

async function notify(mailer, payload) {
  try {
    if (payload.type === 'Bug Report' && mailer.sendBugReportEmails) {
      await mailer.sendBugReportEmails(payload);
      return;
    }
    if (payload.type === 'Feature Request' && mailer.sendFeatureRequestEmails) {
      await mailer.sendFeatureRequestEmails(payload);
      return;
    }
    await mailer.sendFeedbackEmail(payload);
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('Feedback email failed:', err.message);
    }
  }
}

async function createBugReport(payload, options = {}) {
  const user = options.user || {};
  const mailer = options.mailer || defaultMailer;
  const storage = options.storage || cloudinaryStorage;
  const whatHappened = requiredString(payload.whatHappened, 'what happened');
  const stepsToReproduce = requiredString(payload.stepsToReproduce, 'steps to reproduce');

  let screenshot = null;
  if (options.file) {
    validateScreenshot(options.file);
    screenshot = await storage.uploadFeedbackImage(options.file);
  }

  const report = await BugReport.create({
    userId: user.id,
    userEmail: user.email || '',
    whatHappened,
    stepsToReproduce,
    screenshotUrl: screenshot?.url || '',
    screenshotPublicId: screenshot?.publicId || '',
  });

  await notify(mailer, {
    type: 'Bug Report',
    userId: report.userId,
    userEmail: report.userEmail,
    userName: user.name || '',
    whatHappened: report.whatHappened,
    stepsToReproduce: report.stepsToReproduce,
    screenshotUrl: report.screenshotUrl,
  });

  return { id: report._id.toString() };
}

async function createFeatureRequest(payload, options = {}) {
  const user = options.user || {};
  const mailer = options.mailer || defaultMailer;
  const title = requiredString(payload.title, 'title');
  const description = requiredString(payload.description, 'description');

  const featureRequest = await FeatureRequest.create({
    userId: user.id,
    userEmail: user.email || '',
    title,
    description,
  });

  await notify(mailer, {
    type: 'Feature Request',
    userId: featureRequest.userId,
    userEmail: featureRequest.userEmail,
    userName: user.name || '',
    title: featureRequest.title,
    description: featureRequest.description,
  });

  return { id: featureRequest._id.toString() };
}

module.exports = {
  createBugReport,
  createFeatureRequest,
};
