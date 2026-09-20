function hoursAgo(hours, now = new Date()) {
  return new Date(now.getTime() - Number(hours) * 60 * 60 * 1000);
}

function asNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Pure scoring from recent activity windows.
 * Weights favor the queue→vote→publish loop and penalize reports.
 */
function computeTrendingScore(stats = {}, {now = new Date(), createdAt} = {}) {
  const publishes = asNumber(stats.publishes);
  const queueSubmissions = asNumber(stats.queueSubmissions);
  const queueVoteEnergy = asNumber(stats.queueVoteEnergy);
  const comments = asNumber(stats.comments);
  const reactions = asNumber(stats.reactions);
  const joins = asNumber(stats.joins);
  const reports = asNumber(stats.reports);

  let score =
    publishes * 5 +
    queueSubmissions * 2 +
    queueVoteEnergy * 3 +
    comments * 2 +
    reactions * 1 +
    joins * 4 -
    reports * 8;

  const created = createdAt ? new Date(createdAt).getTime() : 0;
  const ageHours = created ? (now.getTime() - created) / (1000 * 60 * 60) : 9999;
  if (ageHours <= 72 && score > 0) score += 2;
  if (ageHours <= 24 && score === 0 && (publishes + queueSubmissions + joins) > 0) score += 1;

  return Math.max(0, Math.round(score * 10) / 10);
}

function deriveTrendingReason(stats = {}, {now = new Date(), createdAt, score} = {}) {
  const publishes = asNumber(stats.publishes);
  const queueSubmissions = asNumber(stats.queueSubmissions);
  const queueVoteEnergy = asNumber(stats.queueVoteEnergy);
  const comments = asNumber(stats.comments);
  const joins = asNumber(stats.joins);
  const total = publishes + queueSubmissions + queueVoteEnergy + comments + joins;
  const created = createdAt ? new Date(createdAt).getTime() : 0;
  const ageHours = created ? (now.getTime() - created) / (1000 * 60 * 60) : 9999;

  if (asNumber(score) <= 0 && total <= 0) {
    if (ageHours <= 72) return 'New corner';
    return '';
  }

  const signals = [
    {label: 'Hot queue', value: queueVoteEnergy * 3 + queueSubmissions},
    {label: 'New discussions', value: publishes * 5 + comments * 2},
    {label: 'Growing fast', value: joins * 4},
  ].sort((a, b) => b.value - a.value);

  if (signals[0].value > 0) return signals[0].label;
  if (ageHours <= 72) return 'New corner';
  return 'Worth a look';
}

function summarizeContentActivity(posts = [], since) {
  const sinceMs = since.getTime();
  let publishes = 0;
  let queueSubmissions = 0;
  let queueVoteEnergy = 0;
  let comments = 0;
  let reactions = 0;
  let reports = 0;

  for (const post of posts) {
    const publishedAt = post.publishedAt ? new Date(post.publishedAt).getTime() : 0;
    const createdAt = post.createdAt ? new Date(post.createdAt).getTime() : 0;

    if (post.state === 'published' && publishedAt >= sinceMs) publishes += 1;
    if (post.state === 'queued' && createdAt >= sinceMs) queueSubmissions += 1;

    if (createdAt >= sinceMs || publishedAt >= sinceMs) {
      const voters = Array.isArray(post.voters) ? post.voters.length : 0;
      queueVoteEnergy += Math.max(voters, Math.abs(asNumber(post.score)));
    }

    for (const comment of post.comments || []) {
      const commentAt = comment.createdAt ? new Date(comment.createdAt).getTime() : 0;
      if (commentAt >= sinceMs) comments += 1;
      for (const reply of comment.replies || []) {
        const replyAt = reply.createdAt ? new Date(reply.createdAt).getTime() : 0;
        if (replyAt >= sinceMs) comments += 1;
      }
    }

    const updatedAt = post.updatedAt ? new Date(post.updatedAt).getTime() : 0;
    if (updatedAt >= sinceMs || publishedAt >= sinceMs) {
      reactions += Array.isArray(post.reactions) ? post.reactions.length : 0;
    }

    for (const report of post.moderation?.reports || []) {
      const reportAt = report.createdAt ? new Date(report.createdAt).getTime() : 0;
      if (reportAt >= sinceMs) reports += 1;
    }
  }

  return {publishes, queueSubmissions, queueVoteEnergy, comments, reactions, reports};
}

module.exports = {
  hoursAgo,
  computeTrendingScore,
  deriveTrendingReason,
  summarizeContentActivity,
};
