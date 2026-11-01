const crypto = require('crypto');
const {v4: uuidv4} = require('uuid');
const {connectRedis} = require('../../database/redisClient');
const {sendAppleEmailVerificationEmail} = require('../email/email.service');

const TTL_SECONDS = 10 * 60;
const MAX_SENDS = 3;
const MAX_ATTEMPTS = 5;

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

async function incrementLimited(redis, key, limit, ttl = TTL_SECONDS) {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, ttl);
  return count <= limit;
}

async function requestAppleEmailVerification({email, appleSubject, appleRelayEmail}) {
  const normalizedEmail = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    const error = new Error('Enter a valid email address.');
    error.statusCode = 400;
    error.code = 'INVALID_EMAIL';
    throw error;
  }

  const redis = await connectRedis();
  const allowed = await incrementLimited(redis, `apple-otp:send:${normalizedEmail}`, MAX_SENDS, 60 * 60);
  if (!allowed) {
    const error = new Error('Too many verification emails. Try again later.');
    error.statusCode = 429;
    error.code = 'OTP_RATE_LIMITED';
    throw error;
  }

  const challengeId = uuidv4();
  const code = String(crypto.randomInt(100000, 1000000));
  await redis.setEx(`apple-otp:${challengeId}`, TTL_SECONDS, JSON.stringify({
    email: normalizedEmail,
    appleSubject,
    appleRelayEmail: appleRelayEmail || '',
    codeHash: hash(code),
    attempts: 0,
  }));
  await sendAppleEmailVerificationEmail({to: normalizedEmail, code});
  return {challengeId, expiresIn: TTL_SECONDS};
}

async function verifyAppleEmailVerification({challengeId, code}) {
  const redis = await connectRedis();
  const key = `apple-otp:${challengeId}`;
  const raw = await redis.get(key);
  if (!raw) {
    const error = new Error('This verification code has expired. Request a new code.');
    error.statusCode = 400;
    error.code = 'OTP_EXPIRED';
    throw error;
  }
  const challenge = JSON.parse(raw);
  challenge.attempts += 1;
  if (challenge.attempts > MAX_ATTEMPTS) {
    await redis.del(key);
    const error = new Error('Too many incorrect codes. Request a new code.');
    error.statusCode = 429;
    error.code = 'OTP_ATTEMPTS_EXCEEDED';
    throw error;
  }
  if (hash(String(code || '').trim()) !== challenge.codeHash) {
    await redis.setEx(key, TTL_SECONDS, JSON.stringify(challenge));
    const error = new Error('That code is incorrect. Check the email and try again.');
    error.statusCode = 400;
    error.code = 'OTP_INVALID';
    throw error;
  }
  await redis.del(key);
  return challenge;
}

module.exports = {requestAppleEmailVerification, verifyAppleEmailVerification, normalizeEmail};
