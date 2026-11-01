const usersDefault = require('../users/user.repository');
const {issueTokenPair, toPublicUser} = require('./auth.controller');
const {requestAppleEmailVerification, verifyAppleEmailVerification, normalizeEmail} = require('./apple-email-verification.service');
function userIdOf(user) { return String(user.id || user._id); }
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
  const email = normalizeEmail(claims.email);
  const isRelayEmail = /@privaterelay\.appleid\.com$/i.test(email);
  const isVerifiedEmail = Boolean(email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && claims.email_verified === true && !isRelayEmail;
  return {subject, email, isRelayEmail, isVerifiedEmail};
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
      const {subject, email, isRelayEmail, isVerifiedEmail} = appleIdentity(claims);
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
      if (user) {
        user = await users.updateById(userIdOf(user), {
          appleRelayEmail: isRelayEmail ? email : user.appleRelayEmail,
          lastLoginAt: new Date(),
        });
      } else if (!isVerifiedEmail) {
        return res.status(422).json({
          error: 'Verify an email address to finish Apple sign-in.',
          code: 'APPLE_EMAIL_VERIFICATION_REQUIRED',
          appleSubject: subject,
          appleRelayEmail: isRelayEmail ? email : '',
        });
      } else {
        user = await users.findByEmail(email);
        if (user) {
          if (user.deletionRequest?.status === 'pending') return res.status(403).json({error:'Account deletion requested', code:'ACCOUNT_DELETION_PENDING'});
          user = await users.updateById(userIdOf(user), {appleSubject: subject, lastLoginAt: new Date()});
        }
      }
      if (!user) {
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

  async function requestEmailVerification(req, res) {
    try {
      const claims = await verifyToken(req.body?.idToken);
      const identity = appleIdentity(claims);
      const requestedEmail = normalizeEmail(req.body?.email);
      if (!requestedEmail) return res.status(400).json({error: 'Email is required', code: 'INVALID_EMAIL'});
      return res.json(await requestAppleEmailVerification({
        email: requestedEmail,
        appleSubject: identity.subject,
        appleRelayEmail: identity.isRelayEmail ? identity.email : '',
      }));
    } catch (err) {
      return res.status(err.statusCode || 401).json({error: err.message || 'Unable to send verification email', code: err.code || 'APPLE_EMAIL_VERIFICATION_FAILED'});
    }
  }

  async function verifyEmailVerification(req, res) {
    try {
      const claims = await verifyToken(req.body?.idToken);
      const identity = appleIdentity(claims);
      const challenge = await verifyAppleEmailVerification({challengeId: req.body?.challengeId, code: req.body?.code});
      if (challenge.appleSubject !== identity.subject) return res.status(401).json({error: 'Apple sign-in session expired. Start again.', code: 'APPLE_SESSION_EXPIRED'});
      let user = await users.findByAppleSubject(identity.subject);
      if (!user) user = await users.findByEmail(challenge.email);
      if (user?.deletionRequest?.status === 'pending') return res.status(403).json({error: 'Account deletion requested', code: 'ACCOUNT_DELETION_PENDING'});
      if (user) {
        user = await users.updateById(userIdOf(user), {
          appleSubject: identity.subject,
          appleRelayEmail: identity.isRelayEmail ? identity.email : user.appleRelayEmail,
          lastLoginAt: new Date(),
        });
      } else {
        user = await users.create({email: challenge.email, appleSubject: identity.subject, appleRelayEmail: identity.isRelayEmail ? identity.email : '', name: typeof claims.name === 'string' ? claims.name : '', lastLoginAt: new Date()});
      }
      return res.json({user: toPublicUser(user), ...(await tokens(user))});
    } catch (err) {
      return res.status(err.statusCode || 401).json({error: err.message || 'Unable to verify email', code: err.code || 'APPLE_EMAIL_VERIFICATION_FAILED'});
    }
  }
  return {
    signIn: (req, res) => authenticate(req, res),
    link: (req, res) => authenticate(req, res, true),
    requestEmailVerification,
    verifyEmailVerification,
  };
}
module.exports = {createAppleAuthController, appleIdentity};
