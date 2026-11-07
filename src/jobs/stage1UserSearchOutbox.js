const {createUserSearchOutboxRepository} = require('../modules/search/user-search-outbox.repository');
const {createOpenSearchSearchRepository} = require('../modules/search/opensearch-search.repository');

function createStage1UserSearchOutboxRunner({
  repository = createUserSearchOutboxRepository(),
  search = createOpenSearchSearchRepository(),
  logger = console,
} = {}) {
  return async function run() {
    if (typeof search.ensureIndex === 'function') {
      try {
        await search.ensureIndex();
      } catch (error) {
        logger.warn?.('[Stage1] OpenSearch index unavailable; search outbox will retry', error?.message || error);
        return;
      }
    }
    for (const row of await repository.listPending()) {
      if (!await repository.claim(row.id)) continue;
      try {
        const payload = row.payload || {};
        if (row.operation === 'delete' || payload.accountActive === false) {
          await search.deleteUser(row.user_id);
        } else {
          await search.upsertUser({id: row.user_id, ...payload});
        }
        await repository.markDone(row.id);
      } catch (error) {
        logger.warn?.('[Stage1] user search outbox retry scheduled', error?.message || error);
        await repository.markFailed(row.id);
      }
    }
  };
}

module.exports = {createStage1UserSearchOutboxRunner};
