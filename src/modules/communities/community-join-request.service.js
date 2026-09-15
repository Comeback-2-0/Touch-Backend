const {httpError} = require('./community-content.service');

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeJoinRequestIdentity({
  useAlias = false,
  alias = '',
  revealUsername = false,
  username = '',
} = {}) {
  const wantsAlias = Boolean(useAlias);
  const wantsUsername = Boolean(revealUsername);
  if (!wantsAlias && !wantsUsername) {
    throw httpError('Choose an alias, your username, or both', 400);
  }

  const normalizedAlias = wantsAlias ? String(alias || '').trim() : '';
  if (wantsAlias && !normalizedAlias) {
    throw httpError('Give your request an alias', 400);
  }

  const normalizedUsername = wantsUsername ? String(username || '').trim().replace(/^@/, '') : '';
  if (wantsUsername && !normalizedUsername) {
    throw httpError('Username is required to reveal your username', 400);
  }

  return {
    alias: normalizedAlias,
    revealUsername: wantsUsername,
    revealedUsername: normalizedUsername,
  };
}

function mapJoinRequestRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    communityId: row.community_id,
    alias: row.alias || '',
    revealUsername: Boolean(row.reveal_username),
    revealedUsername: row.revealed_username || '',
    note: row.note || '',
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

module.exports = {
  mapJoinRequestRow,
  normalizeJoinRequestIdentity,
};
