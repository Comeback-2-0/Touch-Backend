const usersDefault = require('../users/user.repository');
const {issueTokenPair, toPublicUser} = require('./auth.controller');
async function verifyFirebaseAppleToken(token) {
  const admin = require('firebase-admin');
  if (!admin.apps.length)
    admin.initializeApp(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON
        ? {
            credential: admin.credential.cert(
              JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
            ),
          }
        : {},
    );
  return admin.auth().verifyIdToken(token, true);
}
function appleIdentity(claims) {
  if (claims.firebase?.sign_in_provider !== 'apple.com')
    throw Object.assign(Error('Apple authentication required'), {
      statusCode: 401,
    });
  const subject = claims.firebase?.identities?.['apple.com']?.[0];
  if (!subject)
    throw Object.assign(Error('Apple identity missing'), {statusCode: 401});
  const email =
    typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    /@privaterelay\.appleid\.com$/i.test(email) ||
    claims.email_verified !== true
  ) {
    throw Object.assign(
      Error(
        'Touch requires a verified shared email address. Sign in with Google or share your email with Apple.',
      ),
      {statusCode: 400},
    );
  }
  return {subject, email};
}
function createAppleAuthController({
  users = usersDefault,
  verifyToken = verifyFirebaseAppleToken,
  issueTokenPair: tokens = issueTokenPair,
  sendWelcome = payload =>
    require('../email/email.service').sendWelcomeEmail(payload),
} = {}) {
  async function authenticate(req, res, link = false) {
    if (typeof req.body?.idToken !== 'string' || !req.body.idToken)
      return res.status(400).json({error: 'idToken is required'});
    try {
      const claims = await verifyToken(req.body.idToken);
      const {subject, email} = appleIdentity(claims);
      let user = await users.findByAppleSubject(subject);
      if (link) {
        if (user && String(user.id || user._id) !== String(req.user.id))
          return res
            .status(409)
            .json({
              error:
                'This Apple account is already linked to another Touch account',
            });
        const current = await users.findById(req.user.id);
        if (!current || current.deletionRequest?.status === 'pending')
          return res.status(403).json({error: 'Account unavailable'});
        if (current.appleSubject && current.appleSubject !== subject)
          return res
            .status(409)
            .json({error: 'A different Apple account is already linked'});
        user = await users.updateById(req.user.id, {appleSubject: subject});
        return res.json({user: toPublicUser(user)});
      }
      if (!user) {
        if (await users.findByEmail(email))
          return res
            .status(409)
            .json({
              error:
                'An account already uses this email. Sign in with Google, then choose Link Apple Account in Settings.',
            });
        user = await users.create({
          email,
          appleSubject: subject,
          name: typeof claims.name === 'string' ? claims.name : '',
          lastLoginAt: new Date(),
        });
        try {
          await sendWelcome({to: email, name: user.name});
        } catch {
          /* login must not depend on email delivery */
        }
      }
      if (user.deletionRequest?.status === 'pending')
        return res
          .status(403)
          .json({
            error: 'Account deletion requested',
            code: 'ACCOUNT_DELETION_PENDING',
          });
      return res
        .status(200)
        .json({user: toPublicUser(user), ...(await tokens(user))});
    } catch (err) {
      if (err.code === '23505' || err.code === 11000)
        return res
          .status(409)
          .json({
            error:
              'Account already exists. Sign in and link your Apple account in Settings.',
          });
      return res
        .status(err.statusCode || 401)
        .json({
          error: err.statusCode
            ? err.message
            : 'Apple sign-in could not be verified',
        });
    }
  }
  return {
    signIn: (req, res) => authenticate(req, res),
    link: (req, res) => authenticate(req, res, true),
  };
}
module.exports = {createAppleAuthController, appleIdentity};
