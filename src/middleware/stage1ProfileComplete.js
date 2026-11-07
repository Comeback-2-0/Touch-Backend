function requireStage1Profile(req, res, next) {
  if (req.user?.isProfileComplete === false) {
    return res.status(403).json({
      error: 'Complete your profile to use this feature',
      code: 'PROFILE_SETUP_REQUIRED',
    });
  }
  return next();
}

module.exports = {requireStage1Profile};
