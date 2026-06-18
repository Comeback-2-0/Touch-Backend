const { getPostgresClient } = require('../../database/postgresClient');

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapNotificationPreferenceRow(row) {
  if (!row) return null;

  return {
    userId: row.user_id,
    pushEnabled: Boolean(row.push_enabled),
    emailEnabled: Boolean(row.email_enabled),
    inAppEnabled: Boolean(row.in_app_enabled),
    mutedUntil: toIso(row.muted_until),
    preferences: row.preferences || {},
    updatedAt: toIso(row.updated_at),
  };
}

function createNotificationPreferenceRepository(sql = getPostgresClient()) {
  return {
    async getForUser(userId) {
      const rows = await sql`
        select *
        from notification_preferences
        where user_id = ${String(userId)}
        limit 1
      `;
      return mapNotificationPreferenceRow(rows[0]);
    },
    async upsertForUser(userId, input = {}) {
      const rows = await sql`
        insert into notification_preferences (
          user_id, push_enabled, email_enabled, in_app_enabled,
          muted_until, preferences
        )
        values (
          ${String(userId)},
          ${input.pushEnabled !== undefined ? Boolean(input.pushEnabled) : true},
          ${input.emailEnabled !== undefined ? Boolean(input.emailEnabled) : false},
          ${input.inAppEnabled !== undefined ? Boolean(input.inAppEnabled) : true},
          ${input.mutedUntil || null},
          ${sql.json(input.preferences || {})}
        )
        on conflict (user_id) do update set
          push_enabled = excluded.push_enabled,
          email_enabled = excluded.email_enabled,
          in_app_enabled = excluded.in_app_enabled,
          muted_until = excluded.muted_until,
          preferences = excluded.preferences,
          updated_at = now()
        returning *
      `;
      return mapNotificationPreferenceRow(rows[0]);
    },
  };
}

module.exports = {
  createNotificationPreferenceRepository,
  mapNotificationPreferenceRow,
};
