const usersDefault = require('./user.repository');
const {sendAccountDeletionAdminEmail} = require('../email/email.service');

// Working days are Monday-Friday in Asia/Kolkata. Public holidays are not excluded.
function workingDayDeadline(now) {
  const local = new Date(now.getTime() + 330 * 60 * 1000);
  let remaining = 14;
  while (remaining) {
    local.setUTCDate(local.getUTCDate() + 1);
    if (local.getUTCDay() !== 0 && local.getUTCDay() !== 6) remaining--;
  }
  local.setUTCHours(23, 59, 59, 999);
  return new Date(local.getTime() - 330 * 60 * 1000).toISOString();
}
function createAccountDeletionService({
  users = usersDefault,
  sendAdminEmail = sendAccountDeletionAdminEmail,
  now = () => new Date(),
} = {}) {
  async function notify(user) {
    if (!user.deletionRequest || user.deletionRequest.adminEmailSentAt) return;
    try {
      const result = await sendAdminEmail({
        userId: String(user.id || user._id),
        email: user.email,
        name: user.name,
        ...user.deletionRequest,
      });
      if (!result?.skipped)
        await users.markDeletionEmailSent(
          String(user.id || user._id),
          now().toISOString(),
        );
    } catch {
      // Request is durable. The retry worker will send this notification later.
      console.warn('Account deletion admin notification pending retry');
    }
  }
  async function request(userId, input = {}) {
    if (input.confirmed !== true)
      throw Object.assign(new Error('Please confirm account deletion'), {
        statusCode: 400,
      });
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    const details =
      typeof input.details === 'string' ? input.details.trim() : '';
    if (reason.length > 200 || details.length > 2000)
      throw Object.assign(
        new Error(
          'Reason must be at most 200 characters and details at most 2000 characters',
        ),
        {statusCode: 400},
      );
    const timestamp = now();
    const user = await users.requestDeletion(userId, {
      status: 'pending',
      requestedAt: timestamp.toISOString(),
      dueAt: workingDayDeadline(timestamp),
      reason,
      details,
    });
    if (!user)
      throw Object.assign(new Error('User not found'), {statusCode: 404});
    await notify(user);
    return {
      status: 'pending',
      requestedAt: user.deletionRequest.requestedAt,
      dueAt: user.deletionRequest.dueAt,
      workingDays: 14,
    };
  }
  async function retryNotifications() {
    for (const user of await users.findPendingDeletionEmails())
      await notify(user);
  }
  return {request, retryNotifications};
}
module.exports = {workingDayDeadline, createAccountDeletionService};
