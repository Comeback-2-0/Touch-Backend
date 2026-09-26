require('dotenv').config();
const postgres = require('postgres');
const mongoose = require('mongoose');
const CommunityContent = require('../src/modules/communities/community-content.model');

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function idsFromArgs() {
  const values = process.argv
    .map((value, index) => (value === '--id' ? process.argv[index + 1] : null))
    .filter(Boolean)
    .map(String);
  const csv = arg('--ids');
  if (csv) values.push(...csv.split(',').map(value => value.trim()).filter(Boolean));
  return [...new Set(values)];
}

async function main() {
  const ids = idsFromArgs();
  if (!ids.length) throw new Error('Provide --id COMMUNITY_ID (repeatable) or --ids id1,id2');
  const confirm = process.argv.includes('--confirm');
  const sql = postgres(process.env.DATABASE_URL, {max: 1});
  let communities;
  try {
    communities = await sql`select id, name from communities where id in ${sql(ids)}`;
    if (communities.length !== ids.length) {
      const found = new Set(communities.map(row => String(row.id)));
      throw new Error(`Refusing: one or more IDs were not found (${ids.filter(id => !found.has(id)).join(', ')})`);
    }
    const contentCount = await CommunityContent.countDocuments({communityId: {$in: ids}}).catch(() => 0);
    console.log(JSON.stringify({mode: confirm ? 'DELETE' : 'DRY_RUN', communities, mongoCommunityContent: contentCount}, null, 2));
    if (!confirm) return;

    await sql.begin(async transaction => {
      await transaction`delete from communities where id in ${transaction(ids)}`;
    });
  } finally {
    await sql.end({timeout: 5}).catch(() => {});
  }

  await mongoose.connect(process.env.MONGO_URI, {serverSelectionTimeoutMS: 10000});
  try {
    const result = await CommunityContent.deleteMany({communityId: {$in: ids}});
    console.log(JSON.stringify({deletedMongoCommunityContent: result.deletedCount}, null, 2));
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
