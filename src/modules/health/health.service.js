const mongoose = require('mongoose');

async function getHealthStatus({
  connection = mongoose.connection,
  now = Date.now,
  uptime = process.uptime,
} = {}) {
  if (!connection || connection.readyState !== 1 || !connection.db) {
    return { ok: false };
  }

  try {
    await connection.db.admin().ping();
  } catch (err) {
    return { ok: false };
  }

  return {
    ok: true,
    uptime: Math.floor(uptime()),
    timestamp: now(),
  };
}

module.exports = {
  getHealthStatus,
};
