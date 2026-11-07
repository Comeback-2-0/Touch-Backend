require('dotenv').config();

const {getPostgresClient} = require('../database/postgresClient');
const {createOpenSearchSearchRepository} = require('../modules/search/opensearch-search.repository');

async function runStage1OpenSearchBackfill({
  sql = getPostgresClient(),
  search = createOpenSearchSearchRepository(),
  batchSize = 100,
  logger = console,
} = {}) {
  if (typeof search.ensureIndex === 'function') await search.ensureIndex();
  let offset = 0;
  let indexed = 0;
  while (true) {
    const rows = await sql`
      select id, name, username, profile_picture, photo, is_profile_complete,
        (coalesce(deletion_request->>'status', '') <> 'pending') as account_active
      from users
      where is_profile_complete = true
        and coalesce(deletion_request->>'status', '') <> 'pending'
      order by id asc
      limit ${Number(batchSize)} offset ${offset}
    `;
    if (!rows.length) break;
    for (const row of rows) {
      await search.upsertUser({
        id: row.id,
        name: row.name,
        username: row.username,
        profilePicture: row.profile_picture || row.photo || '',
        isProfileComplete: row.is_profile_complete,
        accountActive: row.account_active,
      });
      indexed += 1;
    }
    offset += rows.length;
    logger.info?.(`[Stage1] OpenSearch backfill indexed ${indexed} users`);
    if (rows.length < Number(batchSize)) break;
  }
  return {indexed};
}

if (require.main === module) {
  runStage1OpenSearchBackfill().then(result => {
    console.log(`[Stage1] OpenSearch backfill complete: ${result.indexed} users`);
    process.exit(0);
  }).catch(error => {
    console.error('[Stage1] OpenSearch backfill failed', error);
    process.exit(1);
  });
}

module.exports = {runStage1OpenSearchBackfill};
