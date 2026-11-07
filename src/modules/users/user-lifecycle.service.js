const {createUserGraphOutboxRepository} = require('../graph/user-graph-outbox.repository');
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
 * PostgreSQL is both the user source and the People Search source in Stage 1,
 * so profile mutations do not need a search projection event. Only the
 * Neo4j user-node lifecycle event is emitted here.
 */
async function enqueueUserLifecycleEvents({
  user,
  operation = 'upsert',
  graphOutbox,
  logger = defaultLogger,
} = {}) {
  const payload = buildLifecyclePayload(user, operation);
  let graphRepository;
  try {
    graphRepository = graphOutbox || createUserGraphOutboxRepository();
  } catch (error) {
    logger.warn?.('[Stage1] graph lifecycle outbox unavailable', error?.message || error);
    return {graph: false, payload};
  }
  const graph = await enqueueSafely(
    graphRepository,
    lifecycleOutboxEvent(user, operation),
    logger,
  );

  return {graph, payload};
}

module.exports = {
  userIdOf,
  buildLifecyclePayload,
  lifecycleEventId,
  enqueueUserLifecycleEvents,
};
