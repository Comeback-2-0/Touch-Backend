const assert = require('node:assert/strict');
const test = require('node:test');
const {
  selectEligibleQueuePost,
  normalizeQueueSchedule,
  isQueuePublicationDue,
  resolveScheduleSlotTimes,
} = require('../../../src/modules/communities/community-publication.service');

test('scheduled publication selects highest score then oldest queue post', () => {
  const chosen = selectEligibleQueuePost([
    {id: 'newer', score: 7, createdAt: new Date('2026-09-02')},
    {id: 'older', score: 7, createdAt: new Date('2026-09-01')},
    {id: 'lower', score: 6, createdAt: new Date('2026-08-01')},
  ]);
  assert.equal(chosen.id, 'older');
});

test('normalizes daily schedule at a fixed clock time', () => {
  const schedule = normalizeQueueSchedule({
    type: 'daily',
    dailyTime: '12:00',
    everyDays: 1,
    timezone: 'UTC',
  });
  assert.deepEqual(schedule, {
    type: 'daily',
    dailyTime: '12:00',
    everyDays: 1,
    timezone: 'UTC',
    times: ['12:00'],
    intervalHours: null,
    startTime: null,
  });
});

test('normalizes interval schedule from a start time', () => {
  const schedule = normalizeQueueSchedule({
    type: 'interval',
    intervalHours: 3,
    startTime: '14:00',
    everyDays: 1,
  });
  assert.equal(schedule.type, 'interval');
  assert.equal(schedule.intervalHours, 3);
  assert.equal(schedule.startTime, '14:00');
});

test('normalizes multi-slot schedule for first through nth posts', () => {
  const schedule = normalizeQueueSchedule({
    type: 'slots',
    times: ['09:00', '15:30', '21:00'],
    everyDays: 2,
  });
  assert.equal(schedule.type, 'slots');
  assert.deepEqual(schedule.times, ['09:00', '15:30', '21:00']);
  assert.equal(schedule.everyDays, 2);
});

test('interval slots step from the start time across the day', () => {
  const times = resolveScheduleSlotTimes({
    type: 'interval',
    intervalHours: 3,
    startTime: '14:00',
    everyDays: 1,
    times: [],
  });
  assert.deepEqual(times.slice(0, 4), ['14:00', '17:00', '20:00', '23:00']);
});

test('daily publish is due at the configured time when not yet published that day', () => {
  const due = isQueuePublicationDue({
    queueMode: 'scheduled',
    queueSchedule: normalizeQueueSchedule({type: 'daily', dailyTime: '12:00', everyDays: 1}),
    lastQueuePublishedAt: null,
  }, new Date('2026-09-15T12:00:30.000Z'));
  assert.equal(due, true);
});

test('daily publish is not due twice for the same slot', () => {
  const due = isQueuePublicationDue({
    queueMode: 'scheduled',
    queueSchedule: normalizeQueueSchedule({type: 'daily', dailyTime: '12:00', everyDays: 1}),
    lastQueuePublishedAt: '2026-09-15T12:00:10.000Z',
  }, new Date('2026-09-15T12:05:00.000Z'));
  assert.equal(due, false);
});

test('slot schedule publishes the next due post time', () => {
  const schedule = normalizeQueueSchedule({
    type: 'slots',
    times: ['09:00', '15:00', '21:00'],
    everyDays: 1,
  });
  assert.equal(isQueuePublicationDue({
    queueMode: 'scheduled',
    queueSchedule: schedule,
    lastQueuePublishedAt: '2026-09-15T09:00:05.000Z',
  }, new Date('2026-09-15T15:00:20.000Z')), true);
});

test('legacy minute interval still works without queueSchedule', () => {
  assert.equal(isQueuePublicationDue({
    queueMode: 'scheduled',
    queueScheduleMinutes: 60,
    lastQueuePublishedAt: '2026-09-15T10:00:00.000Z',
  }, new Date('2026-09-15T11:00:00.000Z')), true);
  assert.equal(isQueuePublicationDue({
    queueMode: 'scheduled',
    queueScheduleMinutes: 60,
    lastQueuePublishedAt: '2026-09-15T10:30:00.000Z',
  }, new Date('2026-09-15T11:00:00.000Z')), false);
});
