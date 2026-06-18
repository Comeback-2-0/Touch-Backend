const postgres = require('postgres');

let client;

function createPostgresClient({
  url = process.env.DATABASE_URL,
  postgresFactory = postgres,
  options = {},
} = {}) {
  if (!url) {
    throw new Error('DATABASE_URL is required to connect to PostgreSQL');
  }

  return postgresFactory(url, {
    max: Number(process.env.POSTGRES_MAX_CONNECTIONS || 10),
    idle_timeout: Number(process.env.POSTGRES_IDLE_TIMEOUT || 20),
    connect_timeout: Number(process.env.POSTGRES_CONNECT_TIMEOUT || 10),
    ...options,
  });
}

function getPostgresClient(options = {}) {
  if (!client) {
    client = createPostgresClient(options);
  }

  return client;
}

async function pingPostgres(sql = getPostgresClient()) {
  await sql`select 1 as ok`;
  return true;
}

async function closePostgres(sql = client) {
  if (sql?.end) {
    await sql.end({ timeout: 5 });
  }

  if (sql === client) {
    client = null;
  }
}

module.exports = {
  createPostgresClient,
  getPostgresClient,
  pingPostgres,
  closePostgres,
};
