function createAstraClient({
  apiEndpoint = process.env.ASTRA_DB_API_ENDPOINT,
  applicationToken = process.env.ASTRA_DB_APPLICATION_TOKEN,
  keyspace = process.env.ASTRA_DB_KEYSPACE,
  fetchImpl = global.fetch,
} = {}) {
  if (!apiEndpoint) throw new Error('ASTRA_DB_API_ENDPOINT is required to connect to Astra');
  if (!applicationToken) throw new Error('ASTRA_DB_APPLICATION_TOKEN is required to connect to Astra');
  if (!keyspace) throw new Error('ASTRA_DB_KEYSPACE is required to connect to Astra');
  if (!fetchImpl) throw new Error('A fetch implementation is required to connect to Astra');

  const endpoint = apiEndpoint.replace(/\/+$/, '');

  async function command(collection, body) {
    const response = await fetchImpl(`${endpoint}/api/json/v1/${keyspace}/${collection}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Token: applicationToken,
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.errors?.[0]?.message || payload?.message || 'Astra request failed';
      throw new Error(message);
    }

    return payload;
  }

  return {
    command,
    insertOne(collection, document) {
      return command(collection, { insertOne: { document } });
    },
    findOne(collection, filter) {
      return command(collection, { findOne: { filter } });
    },
    deleteOne(collection, filter) {
      return command(collection, { deleteOne: { filter } });
    },
  };
}

module.exports = {
  createAstraClient,
};
