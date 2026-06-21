const assert = require('node:assert/strict');
const test = require('node:test');

const { createEngagementRepository } = require('../../../src/modules/graph/engagement.repository');

function createRecord(values) {
  return {
    get(key) {
      if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];
      return null;
    },
  };
}

function createDriver({writeRecords = [], readRecords} = {}) {
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
                return { records: writeRecords };
              },
            });
          },
          async executeRead(work) {
            return work({
              async run(cypher, params) {
                runs.push({ cypher, params });
                return {
                  records: readRecords || [createRecord({exists: true, count: 2})],
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

test('like mutations report whether Neo4j created a new relationship', async () => {
  const { driver, runs } = createDriver({writeRecords: [createRecord({created: true})]});
  const repository = createEngagementRepository({ driver });

  const changed = await repository.likeContentIfAbsent({
    userId: 'user-1',
    contentId: 'post-1',
    contentType: 'post',
  });

  assert.equal(changed, true);
  const write = runs.find(entry => entry.cypher);
  assert.match(write.cypher, /MERGE \(u\)-\[r:LIKED\]->\(c\)/);
  assert.match(write.cypher, /ON CREATE SET/);
  assert.match(write.cypher, /RETURN created/);
});

test('unlike mutations report whether Neo4j deleted an existing relationship', async () => {
  const { driver, runs } = createDriver({writeRecords: [createRecord({deleted: true})]});
  const repository = createEngagementRepository({ driver });

  const changed = await repository.unlikeContentIfPresent({
    userId: 'user-1',
    contentId: 'post-1',
    contentType: 'post',
  });

  assert.equal(changed, true);
  const write = runs.find(entry => entry.cypher);
  assert.match(write.cypher, /MATCH \(u:User \{id: \$userId\}\)-\[r:LIKED\]->\(c:Post \{id: \$contentId\}\)/);
  assert.match(write.cypher, /RETURN size\(rels\) > 0 as deleted/);
});

test('batch liked content lookup returns only ids liked by the viewer', async () => {
  const { driver, runs } = createDriver({
    readRecords: [createRecord({contentId: 'post-2'}), createRecord({contentId: 'post-3'})],
  });
  const repository = createEngagementRepository({ driver });

  const likedIds = await repository.likedContentIds({
    userId: 'user-1',
    contentType: 'post',
    contentIds: ['post-1', 'post-2', 'post-3'],
  });

  assert.deepEqual(likedIds, ['post-2', 'post-3']);
  const read = runs.find(entry => entry.cypher);
  assert.match(read.cypher, /WHERE c.id IN \$contentIds/);
  assert.deepEqual(read.params.contentIds, ['post-1', 'post-2', 'post-3']);
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
