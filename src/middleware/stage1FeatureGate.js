function defaultEnabled() {
  if (process.env.TOUCH_STAGE1_ENABLED === 'true') return true;
  if (process.env.TOUCH_STAGE1_ENABLED === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

function createStage1FeatureGate({enabled = defaultEnabled()} = {}) {
  return function stage1FeatureGate(req, res, next) {
    if (enabled) return next();
    return res.status(404).json({error: 'Not found'});
  };
}

module.exports = {createStage1FeatureGate};

