const express = require('express');
const auth = require('../../middleware/auth');
const { createFeedEventController } = require('./feed-event.controller');

function createFeedEventRoutes({
  controller,
} = {}) {
  const router = express.Router();
  let activeController = controller;

  function getController() {
    if (!activeController) {
      activeController = createFeedEventController();
    }
    return activeController;
  }

  router.use(auth);
  router.post('/post-view', (req, res) => getController().recordPostView(req, res));
  router.post('/reel-view', (req, res) => getController().recordReelView(req, res));
  router.post('/watch', (req, res) => getController().recordWatchEvent(req, res));
  router.post('/impression', (req, res) => getController().recordFeedImpression(req, res));
  router.post('/click', (req, res) => getController().recordFeedClick(req, res));
  router.post('/ranking', (req, res) => getController().recordRankingEvent(req, res));

  return router;
}

module.exports = createFeedEventRoutes;
