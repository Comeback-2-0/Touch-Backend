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
    create(input) {
      return activeRepository().create(input);
    },
    update(communityId, input) {
      return activeRepository().update(communityId, input);
    },
    listTrending(limit) {
      return activeRepository().listTrending(limit);
    },
    updateTrending(communityId, input) {
      return activeRepository().updateTrending(communityId, input);
    },
    countRecentJoins(communityId, since) {
      return activeRepository().countRecentJoins(communityId, since);
    },
    listScheduled() {
      return activeRepository().listScheduled();
    },
    markQueuePublished(communityId, at) {
      return activeRepository().markQueuePublished(communityId, at);
    },
    setSuspension(communityId, suspended) {
      return activeRepository().setSuspension(communityId, suspended);
    },
    search(query) {
      return activeRepository().search(query);
    },
    listJoined(userId) {
      return activeRepository().listJoined(userId);
    },
    getMembership(userId, communityId) {
      return activeRepository().getMembership(userId, communityId);
    },
    listMembers(communityId) {
      return activeRepository().listMembers(communityId);
    },
    joinCommunity(input) {
      return activeRepository().joinCommunity(input);
    },
    requestJoin(input) {
      return activeRepository().requestJoin(input);
    },
    getJoinRequest(input) {
      return activeRepository().getJoinRequest(input);
    },
    cancelJoinRequest(input) {
      return activeRepository().cancelJoinRequest(input);
    },
    countPendingJoinRequests(communityId) {
      return activeRepository().countPendingJoinRequests(communityId);
    },
    listJoinRequests(communityId) {
      return activeRepository().listJoinRequests(communityId);
    },
    reviewJoinRequest(input) {
      return activeRepository().reviewJoinRequest(input);
    },
    createInvite(input) {
      return activeRepository().createInvite(input);
    },
    listInvites(communityId) {
      return activeRepository().listInvites(communityId);
    },
    acceptInvite(input) {
      return activeRepository().acceptInvite(input);
    },
    revokeInvite(input) {
      return activeRepository().revokeInvite(input);
    },
    leaveCommunity(input) {
      return activeRepository().leaveCommunity(input);
    },
    setCommunityNotificationMute(input) {
      return activeRepository().setCommunityNotificationMute(input);
    },
    updateMembershipRole(input) {
      return activeRepository().updateMembershipRole(input);
    },
    recoverOwnership(input) {
      return activeRepository().recoverOwnership(input);
    },
    audit(input) {
      return activeRepository().audit(input);
    },
    listAudit(communityId) {
      return activeRepository().listAudit(communityId);
    },
    requestOwnershipTransfer(input) {
      return activeRepository().requestOwnershipTransfer(input);
    },
    listPendingOwnershipTransfers(input) {
      return activeRepository().listPendingOwnershipTransfers(input);
    },
    acceptOwnershipTransfer(input) {
      return activeRepository().acceptOwnershipTransfer(input);
    },
  };
}

module.exports = {
  ...createCommunityRepository(),
  createCommunityRepository,
  shouldUsePostgres,
};
