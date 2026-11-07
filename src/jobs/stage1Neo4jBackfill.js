const {getPostgresClient} = require('../database/postgresClient');
const {getNeo4jDriver} = require('../database/neo4jClient');
const {createSocialGraphRepository} = require('../modules/graph/social.repository');

async function readOrEmpty(sql, query) {
  try { return await sql.unsafe(query); } catch (error) {
    if (/does not exist/i.test(error.message || '')) return [];
    throw error;
  }
}

function pendingDeletion(value) {
  if (!value) return false;
  if (typeof value === 'string') {
    try { return JSON.parse(value)?.status === 'pending'; } catch { return false; }
  }
  return value.status === 'pending';
}

function pairKey(first, second) {
  return `${String(first)}\u0000${String(second)}`;
}

function unorderedPairKey(first, second) {
  return [String(first), String(second)].sort().join('\u0000');
}

function requiredId(row, key, label) {
  const value = String(row?.[key] || '').trim();
  if (!value) throw new Error(`Stage 1 graph backfill has a ${label} row with no ${key}`);
  return value;
}

function validateGraphBackfillRows({users = [], follows = [], requests = [], blocks = [], mutes = []} = {}) {
  const userIds = new Set();
  const activeUserIds = new Set();
  for (const user of users) {
    const userId = requiredId(user, 'id', 'user');
    if (userIds.has(userId)) throw new Error(`Stage 1 graph backfill has duplicate user ${userId}`);
    userIds.add(userId);
    if (Boolean(user.is_profile_complete) && !pendingDeletion(user.deletion_request)) activeUserIds.add(userId);
  }

  function validateActivePair(row, firstKey, secondKey, label) {
    const first = requiredId(row, firstKey, label);
    const second = requiredId(row, secondKey, label);
    if (first === second) throw new Error(`Stage 1 graph backfill has a self ${label}`);
    if (!activeUserIds.has(first) || !activeUserIds.has(second)) {
      throw new Error(`Stage 1 graph backfill has an inactive or unknown user in ${label}`);
    }
    return {first, second};
  }

  const followPairs = new Set();
  for (const row of follows) {
    const {first, second} = validateActivePair(row, 'follower_id', 'followee_id', 'active follow');
    const key = pairKey(first, second);
    if (followPairs.has(key)) throw new Error(`Stage 1 graph backfill has a duplicate active follow ${first}->${second}`);
    followPairs.add(key);
  }

  const pendingRequestPairs = new Set();
  const pendingRequests = [];
  for (const row of requests) {
    const status = String(row?.status || '').toLowerCase();
    if (!['pending', 'accepted', 'rejected', 'cancelled'].includes(status)) {
      throw new Error(`Stage 1 graph backfill has an unsupported follow request status: ${status || 'missing'}`);
    }
    if (status !== 'pending') continue;
    requiredId(row, 'id', 'pending follow request');
    const {first, second} = validateActivePair(row, 'requester_id', 'target_id', 'pending follow request');
    const key = pairKey(first, second);
    if (pendingRequestPairs.has(key)) throw new Error(`Stage 1 graph backfill has a duplicate pending follow request ${first}->${second}`);
    if (followPairs.has(key)) throw new Error(`Stage 1 graph backfill has both a follow and pending request for ${first}->${second}`);
    pendingRequestPairs.add(key);
    pendingRequests.push(row);
  }

  const blockPairs = new Set();
  const blockUndirectedPairs = new Set();
  for (const row of blocks) {
    const {first, second} = validateActivePair(row, 'blocker_id', 'blocked_id', 'block');
    const directed = pairKey(first, second);
    if (blockPairs.has(directed)) throw new Error(`Stage 1 graph backfill has a duplicate block ${first}->${second}`);
    blockPairs.add(directed);
    blockUndirectedPairs.add(unorderedPairKey(first, second));
  }

  for (const key of [...followPairs, ...pendingRequestPairs]) {
    const [first, second] = key.split('\u0000');
    if (blockUndirectedPairs.has(unorderedPairKey(first, second))) {
      throw new Error(`Stage 1 graph backfill has block conflicts for ${first} and ${second}`);
    }
  }

  const mutePairs = new Set();
  for (const row of mutes) {
    const {first, second} = validateActivePair(row, 'muter_id', 'muted_id', 'mute');
    const key = pairKey(first, second);
    if (mutePairs.has(key)) throw new Error(`Stage 1 graph backfill has a duplicate mute ${first}->${second}`);
    mutePairs.add(key);
  }

  return {
    users: users.length,
    activeUsers: activeUserIds.size,
    follows: follows.length,
    requests: pendingRequests.length,
    blocks: blocks.length,
    mutes: mutes.length,
    pendingRequests,
  };
}

async function runStage1Neo4jBackfill({sql = getPostgresClient(), graph = createSocialGraphRepository({driver: getNeo4jDriver()}), logger = console} = {}) {
  const users = await sql`select id, name, username, profile_picture, is_profile_complete, deletion_request from users`;
  const follows = await readOrEmpty(sql, 'select follower_id, followee_id from user_follows where status = \'active\'');
  const requests = await readOrEmpty(sql, 'select id, requester_id, target_id, status from follow_requests');
  const blocks = await readOrEmpty(sql, 'select blocker_id, blocked_id from user_blocks');
  const mutes = await readOrEmpty(sql, 'select muter_id, muted_id from user_mutes');
  const validation = validateGraphBackfillRows({users, follows, requests, blocks, mutes});
  for (const user of users) {
    await graph.ensureUser({
      userId: user.id,
      name: user.name || '',
      username: user.username || '',
      profilePicture: user.profile_picture || '',
      accountActive: Boolean(user.is_profile_complete) && !pendingDeletion(user.deletion_request),
    });
  }
  for (const row of follows) await graph.followUser({followerId: row.follower_id, followeeId: row.followee_id});
  for (const row of validation.pendingRequests) await graph.requestFollow({requesterId: row.requester_id, targetId: row.target_id, requestId: row.id});
  for (const row of blocks) await graph.blockUser({blockerId: row.blocker_id, blockedId: row.blocked_id});
  for (const row of mutes) await graph.muteUser({muterId: row.muter_id, mutedId: row.muted_id});
  logger.log?.(`[Stage1] Neo4j backfill completed: ${validation.users} users (${validation.activeUsers} active), ${validation.follows} follows, ${validation.requests} pending requests, ${validation.blocks} blocks, ${validation.mutes} mutes`);
  return validation;
}

if (require.main === module) runStage1Neo4jBackfill().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = {runStage1Neo4jBackfill, validateGraphBackfillRows};
