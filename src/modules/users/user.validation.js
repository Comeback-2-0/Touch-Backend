const USERNAME_REGEX = /^[a-z0-9._]{3,30}$/;

function normalizeUsername(username) {
  if (typeof username !== 'string') return '';
  return username.trim().toLowerCase();
}

function validateUsername(username, { required = false } = {}) {
  const normalized = normalizeUsername(username);

  if (!normalized) {
    if (required) {
      throw Object.assign(new Error('Username is required'), { statusCode: 400 });
    }
    return null;
  }

  if (normalized.length < 3 || normalized.length > 30) {
    throw Object.assign(new Error('Username must be 3-30 characters'), { statusCode: 400 });
  }

  if (!USERNAME_REGEX.test(normalized)) {
    throw Object.assign(
      new Error('Username can only contain lowercase letters, numbers, underscores, and periods'),
      { statusCode: 400 }
    );
  }

  return normalized;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

module.exports = {
  USERNAME_REGEX,
  normalizeUsername,
  validateUsername,
  toBoolean,
};
