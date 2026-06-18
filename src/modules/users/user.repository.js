const mongoRepository = require('./mongo-user.repository');
const { createPostgresUserRepository } = require('./postgres-user.repository');

let postgresRepository;

function shouldUsePostgres(mode = process.env.USER_STORE) {
  if (process.env.NODE_ENV === 'production') {
    if (mode === 'mongo') {
      throw new Error('Mongo user store is not allowed in production');
    }
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required in production for PostgreSQL user store');
    }
    return true;
  }

  if (mode === 'postgres') return true;
  if (mode === 'mongo') return false;
  return Boolean(process.env.DATABASE_URL && process.env.NODE_ENV !== 'test');
}

function getPostgresRepository() {
  if (!postgresRepository) {
    postgresRepository = createPostgresUserRepository();
  }
  return postgresRepository;
}

function createUserRepository({
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
    findById(userId) {
      return activeRepository().findById(userId);
    },
    findByEmail(email) {
      return activeRepository().findByEmail(email);
    },
    findByUsername(username) {
      return activeRepository().findByUsername(username);
    },
    findUsernameOwner(username, excludeUserId) {
      return activeRepository().findUsernameOwner(username, excludeUserId);
    },
    create(input) {
      return activeRepository().create(input);
    },
    updateById(userId, update) {
      return activeRepository().updateById(userId, update);
    },
    incrementPostsCount(userId, by = 1) {
      return activeRepository().incrementPostsCount(userId, by);
    },
  };
}

const repository = createUserRepository();

module.exports = {
  ...repository,
  createUserRepository,
  shouldUsePostgres,
};
