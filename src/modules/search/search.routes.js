const express = require('express');
const crypto = require('node:crypto');
const auth = require('../../middleware/auth');
const {createSearchService, safeItem} = require('./search.service');
const {createSocialRepository} = require('../social/social.repository');
const {createStage1RateLimit} = require('../../middleware/stage1RateLimit');
const {requireStage1Profile} = require('../../middleware/stage1ProfileComplete');

function createSearchRouter({
  searchService,
  socialRepository,
  authMiddleware = auth,
  rateLimitFactory = createStage1RateLimit,
} = {}) {
  const router = express.Router();
  let service = searchService;

  function requestIdFor(req) {
    const supplied = String(req.headers['x-request-id'] || '').trim();
    return /^[A-Za-z0-9._:-]{1,128}$/.test(supplied) ? supplied : crypto.randomUUID();
  }

  function getService() {
    if (!service) service = createSearchService({socialRepository: socialRepository || createSocialRepository()});
    return service;
  }

  function safeResponse(result = {}) {
    const response = {
      items: Array.isArray(result.items) ? result.items.map(safeItem) : [],
      nextCursor: result.nextCursor ?? null,
      query: String(result.query || ''),
    };
    return response;
  }

  async function people(req, res, mode) {
    const requestId = requestIdFor(req);
    res.setHeader('X-Request-Id', requestId);
    try {
      const result = await getService().people({
        viewerId: req.user.id,
        query: req.query.q,
        mode,
        cursor: req.query.cursor,
        limit: req.query.limit,
        requestId,
      });
      return res.json(safeResponse(result));
    } catch (error) {
      if (error.code === 'SEARCH_QUERY_INVALID' || error.code === 'SEARCH_CURSOR_INVALID' || error.statusCode === 400) {
        return res.status(400).json({error: 'Search query is invalid', code: 'SEARCH_QUERY_INVALID'});
      }
      return res.status(503).json({error: 'Search is temporarily unavailable', code: 'SEARCH_UNAVAILABLE'});
    }
  }

  router.use(authMiddleware);
  router.use(requireStage1Profile);
  router.get('/people/suggest', rateLimitFactory({
    key: 'search-suggestions',
    accountLimit: 60,
    ipLimit: 180,
    burstWindowSeconds: 10,
    burstAccountLimit: 10,
    burstIpLimit: 30,
  }), (req, res) => people(req, res, 'suggest'));
  router.get('/people', rateLimitFactory({key: 'search-full', accountLimit: 30, ipLimit: 120}), (req, res) => people(req, res, 'full'));

  return router;
}

const router = createSearchRouter();
router.createSearchRouter = createSearchRouter;

module.exports = router;
