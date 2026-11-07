const crypto = require('node:crypto');

function userIdOf(user) {
  return String(user?.id || user?._id || user?.userId || '');
}

function buildLifecyclePayload(user, operation = 'upsert') {
  const pendingDeletion = user?.deletionRequest?.status === 'pending';
  const accountActive = operation === 'delete'
    ? false
    : user?.accountActive !== undefined
      ? Boolean(user.accountActive) && !pendingDeletion
      : Boolean(user?.isProfileComplete) && !pendingDeletion;

  return {
    id: userIdOf(user),
    name: String(user?.name || ''),
    username: String(user?.username || ''),
    profilePicture: String(user?.profilePicture || user?.profilePhoto || user?.photo || ''),
    isProfileComplete: Boolean(user?.isProfileComplete),
    accountActive,
    updatedAt: user?.updatedAt || new Date().toISOString(),
  };
}

function lifecycleEventId(user, operation = 'upsert') {
  const payload = buildLifecyclePayload(user, operation);
  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify({operation, payload}))
    .digest('hex');
  return `user-lifecycle:${digest}`;
}

function lifecycleOutboxEvent(user, operation = 'upsert') {
  const payload = buildLifecyclePayload(user, operation);
  return {
    userId: payload.id,
    payload,
    operation,
    eventId: `${lifecycleEventId(user, operation)}:graph`,
  };
}

module.exports = {
  userIdOf,
  buildLifecyclePayload,
  lifecycleEventId,
  lifecycleOutboxEvent,
};
