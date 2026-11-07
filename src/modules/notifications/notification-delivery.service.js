const admin = require('firebase-admin');
const {createNotificationDeviceRepository} = require('./notification-device.repository');
const {createNotificationRepository} = require('./mongo-notification.repository');
const {
  notificationPreferenceDecision,
  readNotificationPreferences,
} = require('./notification-preference.policy');

// First Android release with the notification icon and summary/count behavior.
// Missing or unrecognized versions must keep the original push contract.
const NOTIFICATION_SUMMARY_VERSION = [2, 3, 7];
const STAGE1_NOTIFICATION_DESTINATION_CAPABILITY = 'stage1_notification_destinations';
const STAGE1_NOTIFICATION_TYPES = new Set(['follow', 'follow_request', 'follow_accepted']);

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

function supportsStage1NotificationDestinations(device) {
  return Array.isArray(device.capabilities)
    && device.capabilities.includes(STAGE1_NOTIFICATION_DESTINATION_CAPABILITY);
}

function pushData({type, metadata = {}, includeTypedDestination}) {
  const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};
  const source = includeTypedDestination || !safeMetadata.targetType
    ? safeMetadata
    : Object.fromEntries(Object.entries(safeMetadata).filter(([key]) => ![
      'targetType', 'targetId', 'actorUserId', 'requestId',
    ].includes(key)));
  return Object.fromEntries(Object.entries({type, ...source}).map(([key, value]) => [key, String(value)]));
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

function devicePreferenceKeyFor(type) {
  return {
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
}

async function getPushDeliveryContext({userId, type, preferences, preferenceRepository}) {
  const messaging = getMessaging();
  if (!messaging) return {messaging: null, devices: []};
  // Stage 1 global notification preferences apply only to the new follow-graph
  // notifications. Keep them out of the existing community notification path.
  const isStage1Notification = STAGE1_NOTIFICATION_TYPES.has(type);
  const userPreferences = isStage1Notification && preferences === undefined
    ? await readNotificationPreferences(userId, preferenceRepository)
    : preferences;
  const decision = isStage1Notification
    ? notificationPreferenceDecision({type, preferences: userPreferences})
    : {push: true};
  if (!decision.push) return {messaging, devices: [], preferenceDisabled: true};
  const repo = createNotificationDeviceRepository();
  const preferenceKey = devicePreferenceKeyFor(type);
  const devices = (await repo.listActiveForUser(userId))
    .filter(device => preferenceKey ? device.preferences?.[preferenceKey] !== false : true);
  return {messaging, devices, repo};
}

async function hasEligiblePushDelivery(input) {
  const context = await getPushDeliveryContext(input);
  return Boolean(context.messaging && context.devices.length && !context.preferenceDisabled);
}

async function deliverCommunityNotification({userId, type, title, content, metadata, preferences, preferenceRepository}) {
  const {messaging, devices, repo, preferenceDisabled} = await getPushDeliveryContext({userId, type, preferences, preferenceRepository});
  if (!messaging) return {sent: 0, skipped: true};
  if (preferenceDisabled) return {sent: 0, skipped: true};
  if (!devices.length) return {sent: 0};
  const groups = new Map();
  for (const device of devices) {
    const summary = supportsNotificationSummary(device);
    const typedDestination = supportsStage1NotificationDestinations(device);
    const key = `${summary ? 'summary' : 'legacy'}:${typedDestination ? 'typed' : 'legacy'}`;
    const group = groups.get(key) || {devices: [], summary, typedDestination};
    group.devices.push(device);
    groups.set(key, group);
  }

  // Start legacy delivery independently so badge lookups cannot delay older apps.
  const deliveries = await Promise.all([...groups.values()].map(async group => {
    const payload = {
      tokens: group.devices.map(device => device.token),
      notification: {title: title || 'Touch community update', body: content || 'New community activity'},
      data: pushData({type, metadata, includeTypedDestination: group.typedDestination}),
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

module.exports = {
  deliverCommunityNotification,
  hasEligiblePushDelivery,
  supportsStage1NotificationDestinations,
};
