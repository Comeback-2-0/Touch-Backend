const { getNeo4jDriver } = require('../../database/neo4jClient');

function createSocialGraphRepository({
  driver = getNeo4jDriver(),
  database = process.env.NEO4J_DATABASE,
} = {}) {
  function sessionOptions() {
    return database ? { database } : undefined;
  }

  async function write(cypher, params) {
    const session = driver.session(sessionOptions());
    try {
      return await session.executeWrite(tx => tx.run(cypher, params));
    } finally {
      await session.close();
    }
  }

  function relationshipTimestamp() {
    return new Date().toISOString();
  }

  return {
    followUser({ followerId, followeeId }) {
      return write(
        `
          MERGE (a:User {id: $followerId})
          MERGE (b:User {id: $followeeId})
          MERGE (a)-[r:FOLLOWS]->(b)
          ON CREATE SET r.createdAt = datetime($createdAt)
          RETURN r
        `,
        {
          followerId: String(followerId),
          followeeId: String(followeeId),
          createdAt: relationshipTimestamp(),
        },
      );
    },
    unfollowUser({ followerId, followeeId }) {
      return write(
        `
          MATCH (:User {id: $followerId})-[r:FOLLOWS]->(:User {id: $followeeId})
          DELETE r
        `,
        {
          followerId: String(followerId),
          followeeId: String(followeeId),
        },
      );
    },
    blockUser({ blockerId, blockedId }) {
      return write(
        `
          MERGE (a:User {id: $blockerId})
          MERGE (b:User {id: $blockedId})
          MERGE (a)-[r:BLOCKS]->(b)
          ON CREATE SET r.createdAt = datetime($createdAt)
          RETURN r
        `,
        {
          blockerId: String(blockerId),
          blockedId: String(blockedId),
          createdAt: relationshipTimestamp(),
        },
      );
    },
    unblockUser({ blockerId, blockedId }) {
      return write(
        `
          MATCH (:User {id: $blockerId})-[r:BLOCKS]->(:User {id: $blockedId})
          DELETE r
        `,
        {
          blockerId: String(blockerId),
          blockedId: String(blockedId),
        },
      );
    },
    mirrorMembership({ userId, communityId }) {
      return write(
        `
          MERGE (u:User {id: $userId})
          MERGE (c:Community {id: $communityId})
          MERGE (u)-[r:MEMBER_OF]->(c)
          ON CREATE SET r.createdAt = datetime($createdAt)
          SET r.updatedAt = datetime($createdAt)
          RETURN r
        `,
        {
          userId: String(userId),
          communityId: String(communityId),
          createdAt: relationshipTimestamp(),
        },
      );
    },
    removeMembership({ userId, communityId }) {
      return write(
        `
          MATCH (:User {id: $userId})-[r:MEMBER_OF]->(:Community {id: $communityId})
          DELETE r
        `,
        {
          userId: String(userId),
          communityId: String(communityId),
        },
      );
    },
  };
}

module.exports = {
  createSocialGraphRepository,
};
