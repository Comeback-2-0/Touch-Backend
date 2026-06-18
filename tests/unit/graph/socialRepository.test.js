const assert = require('node:assert/strict');
const test = require('node:test');

const { createSocialGraphRepository } = require('../../../src/modules/graph/social.repository');

function createDriver() {
  const runs = [];
  return {
    runs,
    driver: {
      session(options) {
        runs.push({ sessionOptions: options });
        return {
          async executeWrite(work) {
            return work({
              async run(cypher, params) {
                runs.push({ cypher, params });
                return { records: [] };
              },
            });
          },
          async close() {},
        };
      },
    },
  };
}

test('stable user relationships are stored in Neo4j', async () => {
  const { driver, runs } = createDriver();
  const repository = createSocialGraphRepository({ driver, database: 'neo4j' });

  await repository.followUser({ followerId: 'user-1', followeeId: 'user-2' });
  await repository.blockUser({ blockerId: 'user-1', blockedId: 'user-3' });

  const writes = runs.filter(entry => entry.cypher);
  assert.match(writes[0].cypher, /\[r:FOLLOWS\]/);
  assert.match(writes[1].cypher, /\[r:BLOCKS\]/);
  assert.deepEqual(runs[0].sessionOptions, { database: 'neo4j' });
});

test('community membership mirrors are stored in Neo4j', async () => {
  const { driver, runs } = createDriver();
  const repository = createSocialGraphRepository({ driver });

  await repository.mirrorMembership({ userId: 'user-1', communityId: 'community-1' });

  const write = runs.find(entry => entry.cypher);
  assert.match(write.cypher, /\(c:Community \{id: \$communityId\}\)/);
  assert.match(write.cypher, /\[r:MEMBER_OF\]/);
});
