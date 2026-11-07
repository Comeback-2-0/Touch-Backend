const {createPostgresSearchRepository} = require('./postgres-search.repository');
const {
  normalizeQuery,
  safeLimit,
  encodeCursor,
  decodeCursor,
} = require('./search-query');

function safeItem(value) {
  const source = value?._source || value || {};
  return {
    userId: String(source.userId || source.id || ''),
    username: String(source.username || ''),
    name: String(source.name || ''),
    profilePhoto: String(source.profilePhoto || source.profile_picture || source.photo || ''),
  };
}

function unavailableError(cause) {
  const error = Object.assign(new Error('Search is temporarily unavailable'), {
    code: 'SEARCH_UNAVAILABLE',
    statusCode: 503,
  });
  if (cause) error.cause = cause;
  return error;
}

function createSearchService({
  searchRepository,
  socialRepository,
  logger = console,
} = {}) {
  let repository = searchRepository;

  function getRepository() {
    if (!repository) repository = createPostgresSearchRepository();
    return repository;
  }

  async function filterVisible(viewerId, items, provider) {
    let candidates = items.filter(item => item.userId && item.userId !== String(viewerId));

    // The production PostgreSQL provider already filters active/profile-complete
    // accounts in the same query. Keep this defensive step for injected or
    // future non-authoritative read providers without adding a second query to
    // the normal path.
    if (provider?.authoritative !== true && typeof provider?.activeUserIds === 'function' && candidates.length) {
      const activeIds = new Set(await provider.activeUserIds(candidates.map(item => item.userId)));
      candidates = candidates.filter(item => activeIds.has(String(item.userId)));
    }

    if (socialRepository?.blockedUserIds) {
      const blockedIds = new Set(await socialRepository.blockedUserIds({
        viewerId: String(viewerId),
        targetIds: candidates.map(item => item.userId),
      }));
      return candidates.filter(item => !blockedIds.has(String(item.userId)));
    }
    if (!socialRepository?.relationship) return candidates;

    const visible = [];
    for (const item of candidates) {
      const relation = await socialRepository.relationship({viewerId, targetId: item.userId, authoritative: true});
      if (!relation?.isBlocked && relation?.state !== 'blocked_me') visible.push(item);
    }
    return visible;
  }

  return {
    async people({viewerId, query, mode = 'suggest', cursor, limit, requestId} = {}) {
      const normalized = normalizeQuery(query);
      const decodedCursor = decodeCursor(cursor);
      if (decodedCursor?.query && decodedCursor.query !== normalized) {
        throw Object.assign(new Error('Cursor does not match query'), {
          code: 'SEARCH_CURSOR_INVALID',
          statusCode: 400,
        });
      }

      const provider = getRepository();
      let result;
      try {
        result = await provider.searchPeople({
          viewerId,
          query: normalized,
          mode,
          limit: safeLimit(limit, mode === 'suggest' ? 8 : 20),
          offset: decodedCursor?.offset || 0,
        });
      } catch (error) {
        logger.error?.('[SEARCH] PostgreSQL search failed', {
          requestId: requestId || 'unknown',
          error: error?.message || String(error),
        });
        throw unavailableError(error);
      }

      let items;
      try {
        items = await filterVisible(viewerId, (result?.items || []).map(safeItem), provider);
      } catch (error) {
        logger.error?.('[SEARCH] Authoritative visibility filter failed', {
          requestId: requestId || 'unknown',
          error: error?.message || String(error),
        });
        throw unavailableError(error);
      }

      return {
        items,
        nextCursor: result?.nextOffset === null || result?.nextOffset === undefined
          ? null
          : encodeCursor({type: 'postgres', offset: result.nextOffset, query: normalized}),
        query: normalized,
      };
    },
  };
}

module.exports = {createSearchService, safeItem, unavailableError};
