const neo4j = require('neo4j-driver');

let driver;

function createNeo4jDriver({
  uri = process.env.NEO4J_URI,
  username = process.env.NEO4J_USERNAME,
  password = process.env.NEO4J_PASSWORD,
  database = process.env.NEO4J_DATABASE || 'neo4j',
  driverFactory = neo4j.driver,
  basicAuth = neo4j.auth.basic,
} = {}) {
  if (!uri) throw new Error('NEO4J_URI is required to connect to Neo4j');
  if (!username) throw new Error('NEO4J_USERNAME is required to connect to Neo4j');
  if (!password) throw new Error('NEO4J_PASSWORD is required to connect to Neo4j');

  const createdDriver = driverFactory(uri, basicAuth(username, password));
  createdDriver.__touchDatabase = database;
  return createdDriver;
}

function getNeo4jDriver(options = {}) {
  if (!driver) {
    driver = createNeo4jDriver(options);
  }

  return driver;
}

async function verifyNeo4jConnectivity(neo4jDriver = getNeo4jDriver()) {
  const database = neo4jDriver.__touchDatabase || process.env.NEO4J_DATABASE || 'neo4j';
  await neo4jDriver.verifyConnectivity({ database });
  return true;
}

async function ensureNeo4jSchema(neo4jDriver = getNeo4jDriver()) {
  const database = neo4jDriver.__touchDatabase || process.env.NEO4J_DATABASE || 'neo4j';
  const session = neo4jDriver.session({ database });

  try {
    await session.run(`
      CREATE CONSTRAINT touch_user_id_unique IF NOT EXISTS
      FOR (u:User) REQUIRE u.id IS UNIQUE
    `);
    await session.run(`
      CREATE CONSTRAINT touch_post_id_unique IF NOT EXISTS
      FOR (p:Post) REQUIRE p.id IS UNIQUE
    `);
    await session.run(`
      CREATE CONSTRAINT touch_reel_id_unique IF NOT EXISTS
      FOR (r:Reel) REQUIRE r.id IS UNIQUE
    `);
  } finally {
    await session.close();
  }

  return true;
}

async function closeNeo4j(neo4jDriver = driver) {
  if (neo4jDriver?.close) {
    await neo4jDriver.close();
  }

  if (neo4jDriver === driver) {
    driver = null;
  }
}

module.exports = {
  createNeo4jDriver,
  getNeo4jDriver,
  verifyNeo4jConnectivity,
  ensureNeo4jSchema,
  closeNeo4j,
};
