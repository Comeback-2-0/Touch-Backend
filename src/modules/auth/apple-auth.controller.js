const usersDefault = require('../users/user.repository');
const {issueTokenPair, toPublicUser} = require('./auth.controller');
const {requestAppleEmailVerification, verifyAppleEmailVerification, normalizeEmail} = require('./apple-email-verification.service');
const {enqueueUserLifecycleEvents} = require('../users/user-lifecycle.service');
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
  verifyEmailCode: verifyEmailCode = verifyAppleEmailVerification,
  sendWelcome = payload =>
    require('../email/email.service').sendWelcomeEmail(payload),
  lifecycle = enqueueUserLifecycleEvents,
} = {}) {
  async function createUserWithLifecycle(input) {
    if (typeof users.createWithLifecycle === 'function') return users.createWithLifecycle(input);
    return {user: await users.create(input), lifecycleQueued: false};
  }

  async function updateUserWithLifecycle(userId, update) {
    if (typeof users.updateByIdWithLifecycle === 'function') return users.updateByIdWithLifecycle(userId, update);
    return {user: await users.updateById(userId, update), lifecycleQueued: false};
  }

  async function authenticate(req, res, link = false) {
    if (typeof req.body?.idToken !== 'string' || !req.body.idToken)
      return res.status(400).json({error: 'idToken is required'});
    try {
      const claims = await verifyToken(req.body.idToken);
      const {subject, email, isRelayEmail, isVerifiedEmail} = appleIdentity(claims);
      let user = await users.findByAppleSubject(subject);
      let lifecycleQueued = false;
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
        const persisted = await updateUserWithLifecycle(userIdOf(user), {
          appleRelayEmail: isRelayEmail ? email : user.appleRelayEmail,
          lastLoginAt: new Date(),
        });
        user = persisted.user;
        lifecycleQueued = persisted.lifecycleQueued;
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
          const persisted = await updateUserWithLifecycle(userIdOf(user), {appleSubject: subject, lastLoginAt: new Date()});
          user = persisted.user;
          lifecycleQueued = persisted.lifecycleQueued;
        }
      }
      if (!user) {
        const persisted = await createUserWithLifecycle({
          email,
          appleSubject: subject,
          name: typeof claims.name === 'string' ? claims.name : '',
          lastLoginAt: new Date(),
        });
        user = persisted.user;
        lifecycleQueued = persisted.lifecycleQueued;
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
      if (!lifecycleQueued) await lifecycle({user});
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
      const challenge = await verifyEmailCode({challengeId: req.body?.challengeId, code: req.body?.code});
      if (challenge.appleSubject !== identity.subject) return res.status(401).json({error: 'Apple sign-in session expired. Start again.', code: 'APPLE_SESSION_EXPIRED'});
      const appleUser = await users.findByAppleSubject(identity.subject);
      const emailUser = await users.findByEmail(challenge.email);
      if (
        emailUser?.appleSubject &&
        emailUser.appleSubject !== identity.subject &&
        (!appleUser || userIdOf(emailUser) !== userIdOf(appleUser))
      ) {
        return res.status(409).json({
          error: 'This email is already linked to a different Apple account. Use that Apple account or contact Touch Support.',
          code: 'APPLE_ACCOUNT_ALREADY_LINKED_DIFFERENT_IDENTITY',
        });
      }
      if (appleUser && emailUser && userIdOf(appleUser) !== userIdOf(emailUser)) {
        return res.status(409).json({
          error: 'This Apple account and email belong to different Touch accounts.',
          code: 'APPLE_ACCOUNT_EMAIL_CONFLICT',
        });
      }
      let user = appleUser || emailUser;
      let lifecycleQueued = false;
      if (user?.deletionRequest?.status === 'pending') return res.status(403).json({error: 'Account deletion requested', code: 'ACCOUNT_DELETION_PENDING'});
      if (user) {
        const persisted = await updateUserWithLifecycle(userIdOf(user), {
          appleSubject: identity.subject,
          appleRelayEmail: identity.isRelayEmail ? identity.email : user.appleRelayEmail,
          lastLoginAt: new Date(),
        });
        user = persisted.user;
        lifecycleQueued = persisted.lifecycleQueued;
      } else {
        const persisted = await createUserWithLifecycle({email: challenge.email, appleSubject: identity.subject, appleRelayEmail: identity.isRelayEmail ? identity.email : '', name: typeof claims.name === 'string' ? claims.name : '', lastLoginAt: new Date()});
        user = persisted.user;
        lifecycleQueued = persisted.lifecycleQueued;
      }
      if (!lifecycleQueued) await lifecycle({user});
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
