const assert = require('node:assert/strict');
const test = require('node:test');
const {runStage1Neo4jBackfill, validateGraphBackfillRows} = require('../../../src/jobs/stage1Neo4jBackfill');

const activeUser = id => ({id, is_profile_complete: true, deletion_request: null});

test('Neo4j backfill rejects duplicate directed follows before importing', () => {
  assert.throws(
    () => validateGraphBackfillRows({
      users: [activeUser('a'), activeUser('b')],
      follows: [
        {follower_id: 'a', followee_id: 'b'},
        {follower_id: 'a', followee_id: 'b'},
      ],
      requests: [],
      blocks: [],
      mutes: [],
    }),
    /duplicate active follow/i,
  );
});

test('Neo4j backfill rejects relationships for inactive users and block conflicts', () => {
  assert.throws(
    () => validateGraphBackfillRows({
      users: [activeUser('a'), {...activeUser('b'), is_profile_complete: false}],
      follows: [{follower_id: 'a', followee_id: 'b'}],
      requests: [],
      blocks: [],
      mutes: [],
    }),
    /inactive or unknown user/i,
  );

  assert.throws(
    () => validateGraphBackfillRows({
      users: [activeUser('a'), activeUser('b')],
      follows: [{follower_id: 'a', followee_id: 'b'}],
      requests: [],
      blocks: [{blocker_id: 'a', blocked_id: 'b'}],
      mutes: [],
    }),
    /block conflicts/i,
  );
});

test('Neo4j backfill rejects unsupported follow request statuses', () => {
  assert.throws(
    () => validateGraphBackfillRows({
      users: [activeUser('a'), activeUser('b')],
      follows: [],
      requests: [{id: 'request-1', requester_id: 'a', target_id: 'b', status: 'unknown'}],
      blocks: [],
      mutes: [],
    }),
    /unsupported follow request status/i,
  );
});

test('Neo4j backfill rejects pending requests without stable request IDs', () => {
  assert.throws(
    () => validateGraphBackfillRows({
      users: [activeUser('a'), activeUser('b')],
      follows: [],
      requests: [{requester_id: 'a', target_id: 'b', status: 'pending'}],
      blocks: [],
      mutes: [],
    }),
    /pending follow request row with no id/i,
  );
});

test('Neo4j backfill validates all rows before writing any graph nodes', async () => {
  let graphWrites = 0;
  const sql = async () => [activeUser('a'), activeUser('b')];
  sql.unsafe = async query => query.includes('user_follows')
    ? [{follower_id: 'a', followee_id: 'b'}, {follower_id: 'a', followee_id: 'b'}]
    : [];

  await assert.rejects(
    () => runStage1Neo4jBackfill({
      sql,
      graph: {
        async ensureUser() { graphWrites += 1; },
        async followUser() { graphWrites += 1; },
      },
      logger: {log() {}},
    }),
    /duplicate active follow/i,
  );
  assert.equal(graphWrites, 0);
});
