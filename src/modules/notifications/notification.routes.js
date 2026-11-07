const express = require('express');
const router = express.Router();
const notificationController = require('./notification.controller');
const auth = require('../../middleware/auth');
const {createNotificationDeviceRepository} = require('./notification-device.repository');
const {createStage1RateLimit} = require('../../middleware/stage1RateLimit');
const deviceRepository = createNotificationDeviceRepository();
const notificationReadLimit = createStage1RateLimit({key: 'notification-read', windowSeconds: 60, accountLimit: 60, ipLimit: 120});

router.use(auth);

router.get('/', notificationReadLimit, notificationController.getMyNotifications);
router.get('/preferences', notificationController.getPreferences);
router.put('/preferences', notificationController.updatePreferences);
router.patch('/:id/seen', notificationReadLimit, notificationController.markAsSeen);
router.post('/devices', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!token) return res.status(400).json({error: 'Device token is required'});
  const capabilities = Array.isArray(req.body?.capabilities)
    ? req.body.capabilities.filter(value => typeof value === 'string').slice(0, 20)
    : undefined;
  const device = await deviceRepository.register({userId: req.user.id, token, platform: req.body?.platform, appVersion: req.body?.appVersion, preferences: req.body?.preferences, capabilities});
  return res.status(200).json({device: {...device, token: undefined}});
});
router.get('/devices/preferences', async (req, res) => {
  const token = String(req.query?.token || '').trim();
  return res.json({preferences: token ? await deviceRepository.getPreferences({userId: req.user.id, token}) : null});
});
router.put('/devices/preferences', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!token) return res.status(400).json({error: 'Device token is required'});
  const device = await deviceRepository.updatePreferences({userId: req.user.id, token, preferences: req.body?.preferences || {}});
  return res.json({preferences: device?.preferences || {}});
});
router.delete('/devices', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (token) await deviceRepository.revoke({userId: req.user.id, token});
  return res.status(204).send();
});

module.exports = router;
