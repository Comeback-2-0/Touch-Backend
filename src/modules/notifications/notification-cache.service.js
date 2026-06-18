function unreadCountKey(userId) {
  return `notifications:unread:${userId}`;
}

function deliveryKey(deliveryId) {
  return `notifications:delivery:${deliveryId}`;
}

async function incrementUnreadCount(redis, userId, amount = 1) {
  return redis.incrBy(unreadCountKey(userId), amount);
}

async function decrementUnreadCount(redis, userId, amount = 1) {
  const nextValue = await redis.decrBy(unreadCountKey(userId), amount);
  if (nextValue < 0) {
    await redis.set(unreadCountKey(userId), '0');
    return 0;
  }
  return nextValue;
}

async function getUnreadCount(redis, userId) {
  const value = await redis.get(unreadCountKey(userId));
  return Number(value || 0);
}

async function clearUnreadCount(redis, userId) {
  await redis.del(unreadCountKey(userId));
}

module.exports = {
  unreadCountKey,
  deliveryKey,
  incrementUnreadCount,
  decrementUnreadCount,
  getUnreadCount,
  clearUnreadCount,
};
