const assert = require('node:assert/strict');
const test = require('node:test');

const { createEngagementRepository } = require('../../../src/modules/graph/engagement.repository');

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
          async executeRead(work) {
            return work({
              async run(cypher, params) {
                runs.push({ cypher, params });
                return {
                  records: [{
                    get(key) {
                      if (key === 'exists') return true;
                      if (key === 'count') return 2;
                      return null;
                    },
                  }],
                };
              },
            });
          },
          async close() {
            runs.push({ closed: true });
          },
        };
      },
    },
  };
}

test('likes are stored as Neo4j user-to-content relationships', async () => {
  const { driver, runs } = createDriver();
  const repository = createEngagementRepository({ driver, database: 'neo4j' });

  await repository.likeContent({ userId: 'user-1', contentId: 'post-1', contentType: 'post' });

  const write = runs.find(entry => entry.cypher);
  assert.match(write.cypher, /\(u:User \{id: \$userId\}\)/);
  assert.match(write.cypher, /\(c:Post \{id: \$contentId\}\)/);
  assert.match(write.cypher, /\[r:LIKED\]/);
  assert.deepEqual(write.params, {
    userId: 'user-1',
    contentId: 'post-1',
    createdAt: write.params.createdAt,
  });
  assert.deepEqual(runs[0].sessionOptions, { database: 'neo4j' });
});

test('saves are stored as Neo4j user-to-content relationships', async () => {
  const { driver, runs } = createDriver();
  const repository = createEngagementRepository({ driver });

  await repository.saveContent({ userId: 'user-1', contentId: 'reel-1', contentType: 'reel' });

  const write = runs.find(entry => entry.cypher);
  assert.match(write.cypher, /\(c:Reel \{id: \$contentId\}\)/);
  assert.match(write.cypher, /\[r:SAVED\]/);
});

test('relationship reads expose source-of-truth state and counts', async () => {
  const { driver } = createDriver();
  const repository = createEngagementRepository({ driver });

  assert.equal(
    await repository.hasLiked({ userId: 'user-1', contentId: 'post-1', contentType: 'post' }),
    true,
  );
  assert.equal(await repository.countLikes({ contentId: 'post-1', contentType: 'post' }), 2);
});
