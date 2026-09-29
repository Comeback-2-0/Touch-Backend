const admin = require('firebase-admin');
const {createNotificationDeviceRepository} = require('./notification-device.repository');
const {createNotificationRepository} = require('./mongo-notification.repository');

// First Android release with the notification icon and summary/count behavior.
// Missing or unrecognized versions must keep the original push contract.
const NOTIFICATION_SUMMARY_VERSION = [2, 3, 7];

function supportsNotificationSummary(device) {
  if (device.platform !== 'android' || !/^\d+\.\d+\.\d+$/.test(device.appVersion || '')) return false;
  const version = device.appVersion.split('.').map(Number);
  if (!version.every(Number.isSafeInteger)) return false;
  for (let index = 0; index < NOTIFICATION_SUMMARY_VERSION.length; index += 1) {
    if (version[index] !== NOTIFICATION_SUMMARY_VERSION[index]) {
      return version[index] > NOTIFICATION_SUMMARY_VERSION[index];
    }
  }
  return true;
}

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

async function deliverCommunityNotification({userId, type, title, content, metadata}) {
  const messaging = getMessaging();
  if (!messaging) return {sent: 0, skipped: true};
  const repo = createNotificationDeviceRepository();
  const preferenceKey = {
    community_new_post: 'newPosts',
    community_comment: 'postComments',
    community_reply: 'commentReplies',
    community_join_request: 'joinRequests',
    community_join_approved: 'joinDecisions',
    community_join_declined: 'joinDecisions',
    community_queue_post: 'queueReview',
    community_activity_comment: 'communityActivity',
    community_activity_reply: 'communityActivity',
  }[type];
  const devices = (await repo.listActiveForUser(userId)).filter(device => preferenceKey ? device.preferences?.[preferenceKey] !== false : true);
  if (!devices.length) return {sent: 0};
  const data = Object.fromEntries(Object.entries({type, ...(metadata || {})}).map(([key, value]) => [key, String(value)]));
  const legacyDevices = [];
  const summaryDevices = [];
  for (const device of devices) {
    (supportsNotificationSummary(device) ? summaryDevices : legacyDevices).push(device);
  }

  // Start legacy delivery independently so badge lookups cannot delay older apps.
  const deliveries = await Promise.all([
    {devices: legacyDevices, summary: false},
    {devices: summaryDevices, summary: true},
  ].filter(group => group.devices.length).map(async group => {
    const payload = {
      tokens: group.devices.map(device => device.token),
    notification: {title: title || 'Touch community update', body: content || 'New community activity'},
      data,
    };
    if (group.summary) {
      // Read persisted state: the Redis counter can be missing or stale.
      let notificationCount;
      try {
        notificationCount = await createNotificationRepository().countUnreadForUser(userId);
      } catch {
        console.warn('Notification badge count unavailable; sending push without a count');
      }
      payload.android = {
        notification: {
          // One summary represents the unread total; its tap opens the latest activity.
          tag: 'touch-community-updates',
          ...(notificationCount === undefined ? {} : {notificationCount}),
        },
      };
    }
    const response = await messaging.sendEachForMulticast(payload);
    await Promise.all(response.responses.map((result, index) => {
      if (result.success) return null;
      const code = result.error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
        return repo.revokeByToken(group.devices[index].token);
      }
      return null;
    }));
    return {sent: response.successCount, failed: response.failureCount};
  }));
  return deliveries.reduce((total, delivery) => ({
    sent: total.sent + delivery.sent,
    failed: total.failed + delivery.failed,
  }), {sent: 0, failed: 0});
}

module.exports = {deliverCommunityNotification};
