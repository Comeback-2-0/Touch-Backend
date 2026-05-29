const express = require('express');
const { getHealthStatus } = require('./health.service');

function createHealthRoutes({ getHealthStatus: checkHealth = getHealthStatus } = {}) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const status = await checkHealth();

    res.status(status.ok ? 200 : 500).json(status);
  });

  return router;
}

module.exports = createHealthRoutes;
