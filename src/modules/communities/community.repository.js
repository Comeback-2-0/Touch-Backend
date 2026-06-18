const mongoRepository = require('./mongo-community.repository');
const { createPostgresCommunityRepository } = require('./postgres-community.repository');

let postgresRepository;

function shouldUsePostgres(mode = process.env.COMMUNITY_STORE) {
  if (process.env.NODE_ENV === 'production') {
    if (mode === 'mongo') {
      throw new Error('Mongo community store is not allowed in production');
    }
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required in production for PostgreSQL community store');
    }
    return true;
  }

  if (mode === 'postgres') return true;
  if (mode === 'mongo') return false;
  return Boolean(process.env.DATABASE_URL && process.env.NODE_ENV !== 'test');
}

function getPostgresRepository() {
  if (!postgresRepository) {
    postgresRepository = createPostgresCommunityRepository();
  }
  return postgresRepository;
}

function createCommunityRepository({
  mode,
  postgresRepository: injectedPostgresRepository,
  mongoRepository: injectedMongoRepository = mongoRepository,
} = {}) {
  function activeRepository() {
    if (shouldUsePostgres(mode)) {
      return injectedPostgresRepository || getPostgresRepository();
    }
    return injectedMongoRepository;
  }

  return {
    listAll() {
      return activeRepository().listAll();
    },
    findById(communityId) {
      return activeRepository().findById(communityId);
    },
    listTrending(limit) {
      return activeRepository().listTrending(limit);
    },
    search(query) {
      return activeRepository().search(query);
    },
    listJoined(userId) {
      return activeRepository().listJoined(userId);
    },
    joinCommunity(input) {
      return activeRepository().joinCommunity(input);
    },
  };
}

module.exports = {
  ...createCommunityRepository(),
  createCommunityRepository,
  shouldUsePostgres,
};
