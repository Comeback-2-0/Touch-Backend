function selectEligibleQueuePost(posts) {
  return [...posts].sort((left, right) => right.score - left.score || new Date(left.createdAt) - new Date(right.createdAt))[0] || null;
}

function parseTimeToMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatMinutes(total) {
  const normalized = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizeQueueSchedule(input = {}) {
  const type = String(input.type || '').trim();
  if (!['interval', 'daily', 'slots'].includes(type)) {
    throw Object.assign(new Error('Schedule type must be interval, daily, or slots'), {statusCode: 400});
  }

  const everyDays = Math.max(1, Math.min(30, Number(input.everyDays) || 1));
  const timezone = String(input.timezone || 'UTC').trim() || 'UTC';

  if (type === 'daily') {
    const dailyTime = formatMinutes(parseTimeToMinutes(input.dailyTime ?? input.times?.[0] ?? '12:00') ?? 12 * 60);
    return {
      type,
      dailyTime,
      everyDays,
      timezone,
      times: [dailyTime],
      intervalHours: null,
      startTime: null,
    };
  }

  if (type === 'interval') {
    const intervalHours = Math.max(1, Math.min(24, Number(input.intervalHours) || 3));
    const startMinutes = parseTimeToMinutes(input.startTime ?? '12:00');
    if (startMinutes == null) {
      throw Object.assign(new Error('Start time must look like HH:MM'), {statusCode: 400});
    }
    const startTime = formatMinutes(startMinutes);
    return {
      type,
      intervalHours,
      startTime,
      everyDays,
      timezone,
      times: [],
      dailyTime: null,
    };
  }

  const rawTimes = Array.isArray(input.times) ? input.times : [];
  const times = [...new Set(rawTimes
    .map(value => parseTimeToMinutes(value))
    .filter(value => value != null)
    .sort((a, b) => a - b)
    .map(formatMinutes))];
  if (!times.length) {
    throw Object.assign(new Error('Add at least one post time'), {statusCode: 400});
  }
  return {
    type,
    times,
    everyDays,
    timezone,
    intervalHours: null,
    startTime: null,
    dailyTime: null,
  };
}

function resolveScheduleSlotTimes(schedule) {
  if (!schedule) return [];
  if (schedule.type === 'daily') return [schedule.dailyTime || schedule.times?.[0]].filter(Boolean);
  if (schedule.type === 'slots') return [...(schedule.times || [])];
  if (schedule.type === 'interval') {
    const start = parseTimeToMinutes(schedule.startTime);
    const step = Math.max(1, Number(schedule.intervalHours) || 1) * 60;
    if (start == null) return [];
    const times = [];
    for (let cursor = start, guard = 0; guard < 24; cursor += step, guard += 1) {
      times.push(formatMinutes(cursor));
      if (cursor + step - start >= 24 * 60) break;
    }
    return times;
  }
  return [];
}

function getZonedParts(date, timeZone = 'UTC') {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function zonedDayKey(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function slotDateInTimezone(parts, hhmm, timeZone = 'UTC') {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const guess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hours, minutes, 0));
  const asParts = getZonedParts(guess, timeZone);
  const desiredMinutes = hours * 60 + minutes;
  const actualMinutes = asParts.hour * 60 + asParts.minute;
  const delta = desiredMinutes - actualMinutes;
  return new Date(guess.getTime() + delta * 60 * 1000);
}

function isQueuePublicationDue(community, now = new Date()) {
  if (community?.queueMode !== 'scheduled') return false;

  const schedule = community.queueSchedule;
  if (!schedule || typeof schedule !== 'object') {
    const minutes = Number(community.queueScheduleMinutes || 0);
    if (!minutes) return false;
    const last = community.lastQueuePublishedAt ? new Date(community.lastQueuePublishedAt) : null;
    if (!last) return true;
    return now - last >= minutes * 60 * 1000;
  }

  const timeZone = schedule.timezone || 'UTC';
  const everyDays = Math.max(1, Number(schedule.everyDays) || 1);
  const nowParts = getZonedParts(now, timeZone);
  const dayIndex = Math.floor(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day) / (24 * 60 * 60 * 1000));
  if (dayIndex % everyDays !== 0) return false;

  const last = community.lastQueuePublishedAt ? new Date(community.lastQueuePublishedAt) : null;
  const slotTimes = resolveScheduleSlotTimes(schedule);
  for (const hhmm of slotTimes) {
    const slotAt = slotDateInTimezone(nowParts, hhmm, timeZone);
    if (now < slotAt) continue;
    if (!last || last < slotAt) return true;
  }
  return false;
}

async function publishScheduledCommunityQueues({communities, Content, now = new Date()}) {
  const published = [];
  for (const community of communities) {
    if (!isQueuePublicationDue(community, now)) continue;
    const candidates = await Content.find({communityId: community.id, state: 'queued'}).sort({score: -1, createdAt: 1}).limit(1);
    const post = selectEligibleQueuePost(candidates);
    if (!post) continue;
    post.state = 'published';
    post.publishedAt = now;
    await post.save();
    published.push({communityId: community.id, contentId: String(post._id)});
  }
  return published;
}

module.exports = {
  selectEligibleQueuePost,
  normalizeQueueSchedule,
  resolveScheduleSlotTimes,
  isQueuePublicationDue,
  publishScheduledCommunityQueues,
};
