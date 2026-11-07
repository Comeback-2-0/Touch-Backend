const express = require('express');
const { getHealthStatus } = require('./health.service');
const {getSearchHealthStatus} = require('../search/search.health');

function createHealthRoutes({
  getHealthStatus: checkHealth = getHealthStatus,
  getSearchHealthStatus: checkSearchHealth = getSearchHealthStatus,
} = {}) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const status = await checkHealth();

    res.status(status.ok ? 200 : 500).json(status);
  });

  router.get('/search', async (req, res) => {
    const status = await checkSearchHealth();
    res.status(status.ok ? 200 : 503).json(status);
  });

  return router;
}

module.exports = createHealthRoutes;
