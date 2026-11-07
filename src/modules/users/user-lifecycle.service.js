const {createUserGraphOutboxRepository} = require('../graph/user-graph-outbox.repository');
const {createUserSearchOutboxRepository} = require('../search/user-search-outbox.repository');
const {
  userIdOf,
  buildLifecyclePayload,
  lifecycleEventId,
  lifecycleOutboxEvent,
} = require('./user-lifecycle.payload');
const defaultLogger = process.env.NODE_ENV === 'test' ? {warn() {}} : console;

async function enqueueSafely(repository, event, logger) {
  try {
    await repository.enqueue(event);
    return true;
  } catch (error) {
    logger.warn?.('[Stage1] graph lifecycle event enqueue failed', error?.message || error);
    return false;
  }
}

/**
 * PostgreSQL is the user source, while OpenSearch is the primary People Search
 * provider. Profile mutations therefore emit both graph and search lifecycle
 * events when the transactional PostgreSQL repository is not doing so.
 */
async function enqueueUserLifecycleEvents({
  user,
  operation = 'upsert',
  graphOutbox,
  searchOutbox,
  logger = defaultLogger,
} = {}) {
  const payload = buildLifecyclePayload(user, operation);
  let graphRepository;
  let searchRepository;
  try {
    graphRepository = graphOutbox || createUserGraphOutboxRepository();
  } catch (error) {
    logger.warn?.('[Stage1] graph lifecycle outbox unavailable', error?.message || error);
    return {graph: false, search: false, payload};
  }
  const graph = await enqueueSafely(
    graphRepository,
    lifecycleOutboxEvent(user, operation),
    logger,
  );

  try {
    searchRepository = searchOutbox || createUserSearchOutboxRepository();
  } catch (error) {
    logger.warn?.('[Stage1] user search outbox unavailable', error?.message || error);
  }
  const search = searchRepository
    ? await enqueueSafely(searchRepository, lifecycleOutboxEvent(user, operation), logger)
    : false;

  return {graph, search, payload};
}

module.exports = {
  userIdOf,
  buildLifecyclePayload,
  lifecycleEventId,
  enqueueUserLifecycleEvents,
};
