const MAX_QUERY_LENGTH = 64;
const MAX_CURSOR_LENGTH = 2048;
const MAX_SEARCH_OFFSET = 100000;

function getMaxQueryLength() {
  const configured = Number(process.env.SEARCH_MAX_QUERY_LENGTH);
  return Number.isInteger(configured) && configured >= 2 && configured <= 128
    ? configured
    : MAX_QUERY_LENGTH;
}

function queryError(message, code = 'SEARCH_QUERY_INVALID') {
  return Object.assign(new Error(message), {code, statusCode: 400});
}

function normalizeQuery(input) {
  const value = String(input ?? '').trim().replace(/^@/, '').replace(/\s+/g, ' ');
  if (value.length < 2) throw queryError('Query must contain at least two characters');
  if (value.length > getMaxQueryLength()) throw queryError('Query is too long');
  return value.toLowerCase();
}

function safeLimit(limit, fallback) {
  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, fallback);
}

function encodeCursor(value) {
  if (value === undefined || value === null) return null;
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor(value) {
  if (!value) return undefined;
  try {
    const encoded = String(value);
    if (encoded.length > MAX_CURSOR_LENGTH) throw new Error('cursor too large');
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid cursor');
    if (!['opensearch', 'postgres'].includes(parsed.type)) throw new Error('invalid search provider cursor');
    if (typeof parsed.query !== 'string' || parsed.query.length < 2 || parsed.query.length > getMaxQueryLength()) {
      throw new Error('cursor query is missing or invalid');
    }
    if (!Number.isInteger(parsed.offset) || parsed.offset < 0 || parsed.offset > MAX_SEARCH_OFFSET) {
      throw new Error('invalid search cursor');
    }
    return parsed;
  } catch {
    throw queryError('Invalid cursor', 'SEARCH_CURSOR_INVALID');
  }
}

module.exports = {
  MAX_QUERY_LENGTH,
  MAX_CURSOR_LENGTH,
  MAX_SEARCH_OFFSET,
  MAX_POSTGRES_OFFSET: MAX_SEARCH_OFFSET,
  getMaxQueryLength,
  normalizeQuery,
  safeLimit,
  encodeCursor,
  decodeCursor,
};
