const {createOpenSearchSearchRepository} = require('./opensearch-search.repository');
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
  openSearchRepository,
  postgresSearchRepository,
  // Compatibility injection name: it now represents the primary provider.
  searchRepository,
  socialRepository,
  logger = console,
} = {}) {
  let openSearch = openSearchRepository || searchRepository;
  let postgres = postgresSearchRepository;

  function getOpenSearchRepository() {
    if (!openSearch) openSearch = createOpenSearchSearchRepository();
    return openSearch;
  }

  function getPostgresRepository() {
    if (!postgres) postgres = createPostgresSearchRepository();
    return postgres;
  }

  async function filterVisible(viewerId, items, provider) {
    let candidates = items.filter(item => item.userId && item.userId !== String(viewerId));

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

  async function execute(repository, input) {
    const result = await repository.searchPeople(input);
    return {
      result,
      provider: repository.provider || (repository === postgres ? 'postgres' : 'opensearch'),
      repository,
    };
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

      const input = {
        viewerId,
        query: normalized,
        mode,
        limit: safeLimit(limit, mode === 'suggest' ? 8 : 20),
        offset: decodedCursor?.offset || 0,
      };
      let executed;
      try {
        executed = await execute(getOpenSearchRepository(), input);
      } catch (error) {
        if (!error?.fallbackAllowed) {
          logger.error?.('[SEARCH] OpenSearch request failed', {
            requestId: requestId || 'unknown',
            error: error?.message || String(error),
          });
          throw unavailableError(error);
        }
        logger.warn?.('[SEARCH] OpenSearch unavailable; using PostgreSQL fallback', {
          requestId: requestId || 'unknown',
        });
        try {
          executed = await execute(getPostgresRepository(), input);
        } catch (fallbackError) {
          logger.error?.('[SEARCH] PostgreSQL fallback failed', {
            requestId: requestId || 'unknown',
            error: fallbackError?.message || String(fallbackError),
          });
          throw unavailableError(fallbackError);
        }
      }

      let items;
      try {
        items = await filterVisible(viewerId, (executed.result?.items || []).map(safeItem), executed.repository);
      } catch (error) {
        logger.error?.('[SEARCH] Authoritative visibility filter failed', {
          requestId: requestId || 'unknown',
          error: error?.message || String(error),
        });
        throw unavailableError(error);
      }

      const provider = executed.provider === 'postgres' ? 'postgres' : 'opensearch';
      return {
        items,
        nextCursor: executed.result?.nextOffset === null || executed.result?.nextOffset === undefined
          ? null
          : encodeCursor({type: provider, offset: executed.result.nextOffset, query: normalized}),
        query: normalized,
        provider,
        degraded: provider === 'postgres',
      };
    },
  };
}

module.exports = {createSearchService, safeItem, unavailableError};
