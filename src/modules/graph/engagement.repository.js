const { getNeo4jDriver } = require('../../database/neo4jClient');

const CONTENT_LABELS = {
  post: 'Post',
  reel: 'Reel',
};

function contentLabel(contentType) {
  const label = CONTENT_LABELS[String(contentType || '').toLowerCase()];
  if (!label) {
    throw new Error('Unsupported engagement content type');
  }
  return label;
}

function createEngagementRepository({
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

  async function read(cypher, params) {
    const session = driver.session(sessionOptions());
    try {
      return await session.executeRead(tx => tx.run(cypher, params));
    } finally {
      await session.close();
    }
  }

  async function createRelationship({ userId, contentId, contentType, relationship }) {
    const label = contentLabel(contentType);
    await write(
      `
        MERGE (u:User {id: $userId})
        MERGE (c:${label} {id: $contentId})
        MERGE (u)-[r:${relationship}]->(c)
        ON CREATE SET r.createdAt = datetime($createdAt)
        RETURN r
      `,
      {
        userId: String(userId),
        contentId: String(contentId),
        createdAt: new Date().toISOString(),
      },
    );
  }

  async function deleteRelationship({ userId, contentId, contentType, relationship }) {
    const label = contentLabel(contentType);
    await write(
      `
        MATCH (u:User {id: $userId})-[r:${relationship}]->(c:${label} {id: $contentId})
        DELETE r
      `,
      {
        userId: String(userId),
        contentId: String(contentId),
      },
    );
  }

  async function hasRelationship({ userId, contentId, contentType, relationship }) {
    const label = contentLabel(contentType);
    const result = await read(
      `
        MATCH (u:User {id: $userId})
        MATCH (c:${label} {id: $contentId})
        RETURN exists((u)-[:${relationship}]->(c)) as exists
      `,
      {
        userId: String(userId),
        contentId: String(contentId),
      },
    );
    return Boolean(result.records[0]?.get('exists'));
  }

  async function countRelationship({ contentId, contentType, relationship }) {
    const label = contentLabel(contentType);
    const result = await read(
      `
        MATCH (:User)-[:${relationship}]->(c:${label} {id: $contentId})
        RETURN count(*) as count
      `,
      { contentId: String(contentId) },
    );
    const count = result.records[0]?.get('count') || 0;
    return typeof count.toNumber === 'function' ? count.toNumber() : Number(count);
  }

  return {
    likeContent(input) {
      return createRelationship({ ...input, relationship: 'LIKED' });
    },
    unlikeContent(input) {
      return deleteRelationship({ ...input, relationship: 'LIKED' });
    },
    saveContent(input) {
      return createRelationship({ ...input, relationship: 'SAVED' });
    },
    unsaveContent(input) {
      return deleteRelationship({ ...input, relationship: 'SAVED' });
    },
    hasLiked(input) {
      return hasRelationship({ ...input, relationship: 'LIKED' });
    },
    hasSaved(input) {
      return hasRelationship({ ...input, relationship: 'SAVED' });
    },
    countLikes(input) {
      return countRelationship({ ...input, relationship: 'LIKED' });
    },
    countSaves(input) {
      return countRelationship({ ...input, relationship: 'SAVED' });
    },
  };
}

module.exports = {
  createEngagementRepository,
};
