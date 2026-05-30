const mongoose = require('mongoose');

const bugReportSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    userEmail: { type: String, default: '' },
    whatHappened: { type: String, required: true, trim: true, maxlength: 2000 },
    stepsToReproduce: { type: String, required: true, trim: true, maxlength: 4000 },
    screenshotUrl: { type: String, default: '' },
    screenshotPublicId: { type: String, default: '' },
    status: {
      type: String,
      enum: ['open', 'reviewing', 'resolved', 'closed'],
      default: 'open',
      index: true,
    },
  },
  { timestamps: true, collection: 'bug_reports' },
);

module.exports = mongoose.model('BugReport', bugReportSchema);
