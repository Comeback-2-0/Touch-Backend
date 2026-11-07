const DEFAULT_TIMEOUT_MS = 750;

function boundedTimeout(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(5000, Math.max(100, Math.floor(parsed)));
}

function providerError(message, {code, status, fallbackAllowed = false, cause} = {}) {
  const error = Object.assign(new Error(message), {code, statusCode: status, fallbackAllowed});
  if (cause) error.cause = cause;
  return error;
}

function isAvailabilityStatus(status) {
  return status === 408 || status >= 500;
}

function authorizationHeader({apiKey, username, password}) {
  if (apiKey) return `ApiKey ${apiKey}`;
  if (username && password) return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  return undefined;
}

function normalizeUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function connectionDetails(value, {apiKey, username, password} = {}) {
  const rawUrl = String(value || '');
  try {
    const parsed = new URL(rawUrl);
    const embeddedUsername = parsed.username ? decodeURIComponent(parsed.username) : '';
    const embeddedPassword = parsed.password ? decodeURIComponent(parsed.password) : '';
    parsed.username = '';
    parsed.password = '';
    return {
      baseUrl: normalizeUrl(parsed.toString()),
      apiKey,
      username: username || embeddedUsername,
      password: password || embeddedPassword,
    };
  } catch {
    return {baseUrl: normalizeUrl(rawUrl), apiKey, username, password};
  }
}

function mapHit(hit = {}) {
  const source = hit._source || {};
  return {
    userId: String(source.userId || hit._id || ''),
    username: String(source.username || ''),
    name: String(source.name || ''),
    profilePhoto: String(source.profilePhoto || ''),
  };
}

function createOpenSearchSearchRepository({
  url = process.env.OPENSEARCH_URL,
  index = process.env.OPENSEARCH_INDEX || 'touch-users-v1',
  apiKey = process.env.OPENSEARCH_API_KEY,
  username = process.env.OPENSEARCH_USERNAME,
  password = process.env.OPENSEARCH_PASSWORD,
  timeoutMs = boundedTimeout(process.env.OPENSEARCH_TIMEOUT_MS || process.env.SEARCH_DATABASE_TIMEOUT_MS),
  fetchImpl = global.fetch,
} = {}) {
  const connection = connectionDetails(url, {apiKey, username, password});
  const baseUrl = connection.baseUrl;
  const authorization = authorizationHeader(connection);

  async function request(path, options = {}) {
    if (!baseUrl || typeof fetchImpl !== 'function') {
      throw providerError('OpenSearch is not configured', {
        code: 'OPENSEARCH_REQUEST_FAILED',
        fallbackAllowed: false,
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const {allowStatuses = [], ...fetchOptions} = options;
      const headers = {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(authorization ? {authorization} : {}),
        ...(options.headers || {}),
      };
      let response;
      try {
        response = await fetchImpl(`${baseUrl}${path}`, {
          ...fetchOptions,
          headers,
          signal: controller.signal,
        });
      } catch (error) {
        throw providerError('OpenSearch is unavailable', {
          code: 'OPENSEARCH_UNAVAILABLE',
          fallbackAllowed: true,
          cause: error,
        });
      }

      if (!response.ok && !allowStatuses.includes(Number(response.status))) {
        const status = Number(response.status) || 0;
        throw providerError('OpenSearch request failed', {
          code: isAvailabilityStatus(status) ? 'OPENSEARCH_UNAVAILABLE' : 'OPENSEARCH_REQUEST_FAILED',
          status,
          fallbackAllowed: isAvailabilityStatus(status),
        });
      }
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    provider: 'opensearch',
    authoritative: true,

    async ping() {
      await request(`/${encodeURIComponent(index)}/_search`, {
        method: 'POST',
        body: JSON.stringify({size: 0, track_total_hits: false, query: {match_all: {}}}),
      });
      return true;
    },

    async ensureIndex() {
      const existing = await request(`/${encodeURIComponent(index)}`, {method: 'HEAD', allowStatuses: [404]});
      if (existing.status !== 404) return false;
      await request(`/${encodeURIComponent(index)}`, {
        method: 'PUT',
        body: JSON.stringify({
          mappings: {
            dynamic: 'strict',
            properties: {
              userId: {type: 'keyword'},
              username: {type: 'keyword'},
              usernameNormalized: {type: 'keyword'},
              name: {type: 'keyword'},
              nameNormalized: {type: 'keyword'},
              profilePhoto: {type: 'keyword', index: false},
              isProfileComplete: {type: 'boolean'},
              accountActive: {type: 'boolean'},
            },
          },
        }),
      });
      return true;
    },

    async searchPeople({query, viewerId, limit = 20, offset = 0}) {
      const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 20));
      const safeOffset = Math.max(0, Number.isInteger(offset) ? offset : 0);
      const normalized = String(query || '').toLowerCase();
      const body = {
        from: safeOffset,
        size: safeLimit + 1,
        track_total_hits: false,
        query: {
          bool: {
            filter: [
              {term: {isProfileComplete: true}},
              {term: {accountActive: true}},
            ],
            must_not: [
              {term: {userId: String(viewerId)}},
            ],
            should: [
              {term: {usernameNormalized: {value: normalized, boost: 8}}},
              {prefix: {usernameNormalized: {value: normalized, boost: 5}}},
              {term: {nameNormalized: {value: normalized, boost: 4}}},
              {prefix: {nameNormalized: {value: normalized, boost: 2}}},
            ],
            minimum_should_match: 1,
          },
        },
        sort: [
          {_score: 'desc'},
          {usernameNormalized: 'asc'},
          {userId: 'asc'},
        ],
      };
      const response = await request(`/${encodeURIComponent(index)}/_search`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      const hits = Array.isArray(payload?.hits?.hits) ? payload.hits.hits : [];
      return {
        items: hits.slice(0, safeLimit).map(mapHit),
        nextOffset: hits.length > safeLimit ? safeOffset + safeLimit : null,
      };
    },

    async upsertUser(user) {
      const userId = String(user?.id || user?.userId || '');
      if (!userId) throw new Error('user id is required for OpenSearch indexing');
      const document = {
        userId,
        username: String(user.username || '').trim(),
        usernameNormalized: String(user.username || '').trim().toLowerCase(),
        name: String(user.name || '').trim(),
        nameNormalized: String(user.name || '').trim().toLowerCase(),
        profilePhoto: String(user.profilePicture || user.profilePhoto || user.photo || ''),
        isProfileComplete: Boolean(user.isProfileComplete),
        accountActive: user.accountActive !== false,
      };
      await request(`/${encodeURIComponent(index)}/_doc/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        body: JSON.stringify(document),
      });
    },

    async deleteUser(userId) {
      try {
        await request(`/${encodeURIComponent(index)}/_doc/${encodeURIComponent(String(userId))}`, {method: 'DELETE'});
      } catch (error) {
        if (error.statusCode === 404) return;
        throw error;
      }
    },
  };
}

module.exports = {
  createOpenSearchSearchRepository,
  boundedTimeout,
  isAvailabilityStatus,
  mapHit,
};
