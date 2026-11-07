const {createSocialGraphRepository} = require('../graph/social.repository');

// Relationship notification events live beside the graph mutation in Neo4j.
function createNotificationEventOutboxRepository(graph = createSocialGraphRepository()) {
  return {
    listPending(limit = 50) { return graph.listNotificationOutbox(limit); },
    async markProcessing(id) { return graph.claimNotificationOutbox(id); },
    markDelivered(id) { return graph.markNotificationDelivered(id); },
    isBlockedPair({firstId, secondId}) { return graph.isBlockedPair({firstId, secondId}); },
    markSuppressed(id) { return graph.markNotificationSuppressed(id); },
    markFailed(id) { return graph.markNotificationFailed(id); },
  };
}
module.exports = {createNotificationEventOutboxRepository};
