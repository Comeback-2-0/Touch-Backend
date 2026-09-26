const admin = require('firebase-admin');
const {createNotificationDeviceRepository} = require('./notification-device.repository');

let initialized = false;
function getMessaging() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS) return null;
  if (!initialized) {
    const options = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      ? {credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))}
      : {credential: admin.credential.applicationDefault()};
    if (!admin.apps.length) admin.initializeApp(options);
    initialized = true;
  }
  return admin.messaging();
}

async function deliverCommunityNotification({userId, type, content, metadata}) {
  const messaging = getMessaging();
  if (!messaging) return {sent: 0, skipped: true};
  const devices = await createNotificationDeviceRepository().listActiveForUser(userId);
  if (!devices.length) return {sent: 0};
  const data = Object.fromEntries(Object.entries({type, ...(metadata || {})}).map(([key, value]) => [key, String(value)]));
  const response = await messaging.sendEachForMulticast({
    tokens: devices.map(device => device.token),
    notification: {title: 'Touch community update', body: content || 'New community activity'},
    data,
  });
  const repo = createNotificationDeviceRepository();
  await Promise.all(response.responses.map((result, index) => {
    if (result.success) return null;
    const code = result.error?.code || '';
    if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
      return repo.revokeByToken(devices[index].token);
    }
    return null;
  }));
  return {sent: response.successCount, failed: response.failureCount};
}

module.exports = {deliverCommunityNotification};
