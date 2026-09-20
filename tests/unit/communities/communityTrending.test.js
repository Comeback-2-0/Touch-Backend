const assert = require('node:assert/strict');
const test = require('node:test');
const {
  computeTrendingScore,
  deriveTrendingReason,
  summarizeContentActivity,
  hoursAgo,
} = require('../../../src/modules/communities/community-trending.service');

const now = new Date('2026-09-16T12:00:00.000Z');

test('scores queue votes and publishes higher than soft signals', () => {
  const score = computeTrendingScore(
    {
      publishes: 2,
      queueSubmissions: 1,
      queueVoteEnergy: 4,
      comments: 3,
      reactions: 5,
      joins: 1,
      reports: 0,
    },
    {now, createdAt: '2026-09-15T12:00:00.000Z'},
  );
  // 2*5 + 1*2 + 4*3 + 3*2 + 5*1 + 1*4 + newness bonus 2 = 10+2+12+6+5+4+2 = 41
  assert.equal(score, 41);
});

test('reports heavily penalize the score and floor at zero', () => {
  const score = computeTrendingScore(
    {publishes: 1, queueSubmissions: 0, queueVoteEnergy: 0, comments: 0, reactions: 0, joins: 0, reports: 3},
    {now, createdAt: '2026-01-01T00:00:00.000Z'},
  );
  assert.equal(score, 0);
});

test('deriveTrendingReason prefers the strongest live signal', () => {
  assert.equal(
    deriveTrendingReason(
      {publishes: 0, queueSubmissions: 3, queueVoteEnergy: 5, comments: 0, joins: 0},
      {now, createdAt: '2026-09-10T00:00:00.000Z', score: 20},
    ),
    'Hot queue',
  );
  assert.equal(
    deriveTrendingReason(
      {publishes: 4, queueSubmissions: 0, queueVoteEnergy: 0, comments: 2, joins: 0},
      {now, createdAt: '2026-09-10T00:00:00.000Z', score: 24},
    ),
    'New discussions',
  );
  assert.equal(
    deriveTrendingReason(
      {publishes: 0, queueSubmissions: 0, queueVoteEnergy: 0, comments: 0, joins: 3},
      {now, createdAt: '2026-09-10T00:00:00.000Z', score: 12},
    ),
    'Growing fast',
  );
});

test('quiet new communities get New corner instead of a fake hot chip', () => {
  assert.equal(
    deriveTrendingReason(
      {publishes: 0, queueSubmissions: 0, queueVoteEnergy: 0, comments: 0, joins: 0},
      {now, createdAt: '2026-09-15T12:00:00.000Z', score: 0},
    ),
    'New corner',
  );
  assert.equal(
    deriveTrendingReason(
      {publishes: 0, queueSubmissions: 0, queueVoteEnergy: 0, comments: 0, joins: 0},
      {now, createdAt: '2026-01-01T00:00:00.000Z', score: 0},
    ),
    '',
  );
});

test('summarizeContentActivity counts only activity inside the window', () => {
  const since = hoursAgo(72, now);
  const stats = summarizeContentActivity(
    [
      {
        state: 'published',
        publishedAt: '2026-09-15T10:00:00.000Z',
        createdAt: '2026-09-14T10:00:00.000Z',
        updatedAt: '2026-09-15T11:00:00.000Z',
        score: 3,
        voters: [{}, {}],
        comments: [
          {createdAt: '2026-09-15T11:00:00.000Z', replies: [{createdAt: '2026-09-15T12:00:00.000Z'}]},
          {createdAt: '2026-01-01T00:00:00.000Z', replies: []},
        ],
        reactions: [{}, {}, {}],
        moderation: {reports: [{createdAt: '2026-09-16T01:00:00.000Z'}, {createdAt: '2025-01-01T00:00:00.000Z'}]},
      },
      {
        state: 'queued',
        createdAt: '2026-09-16T08:00:00.000Z',
        updatedAt: '2026-09-16T08:00:00.000Z',
        score: 5,
        voters: [{}],
        comments: [],
        reactions: [],
        moderation: {reports: []},
      },
    ],
    since,
  );

  assert.deepEqual(stats, {
    publishes: 1,
    queueSubmissions: 1,
    queueVoteEnergy: 8,
    comments: 2,
    reactions: 3,
    reports: 1,
  });
});
