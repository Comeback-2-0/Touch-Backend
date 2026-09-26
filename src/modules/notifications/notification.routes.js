const express = require('express');
const router = express.Router();
const notificationController = require('./notification.controller');
const auth = require('../../middleware/auth');
const {createNotificationDeviceRepository} = require('./notification-device.repository');
const deviceRepository = createNotificationDeviceRepository();

router.use(auth);

router.get('/', notificationController.getMyNotifications);
router.get('/preferences', notificationController.getPreferences);
router.put('/preferences', notificationController.updatePreferences);
router.patch('/:id/seen', notificationController.markAsSeen);
router.post('/devices', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!token) return res.status(400).json({error: 'Device token is required'});
  const device = await deviceRepository.register({userId: req.user.id, token, platform: req.body?.platform, appVersion: req.body?.appVersion});
  return res.status(200).json({device: {...device, token: undefined}});
});
router.delete('/devices', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (token) await deviceRepository.revoke({userId: req.user.id, token});
  return res.status(204).send();
});

module.exports = router;
