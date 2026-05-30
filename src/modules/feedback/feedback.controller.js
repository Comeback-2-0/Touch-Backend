const feedbackService = require('./feedback.service');

async function createBugReport(req, res) {
  try {
    const result = await feedbackService.createBugReport(req.body, {
      user: req.user,
      file: req.file,
    });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || 'Unable to submit bug report' });
  }
}

async function createFeatureRequest(req, res) {
  try {
    const result = await feedbackService.createFeatureRequest(req.body, {
      user: req.user,
    });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || 'Unable to submit feature request' });
  }
}

module.exports = {
  createBugReport,
  createFeatureRequest,
};
