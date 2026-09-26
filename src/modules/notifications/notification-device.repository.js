const {v4: uuidv4} = require('uuid');
const {getPostgresClient} = require('../../database/postgresClient');

function map(row) {
  return row ? {
    id: row.id,
    userId: row.user_id,
    token: row.token,
    platform: row.platform,
    appVersion: row.app_version,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
  } : null;
}

function createNotificationDeviceRepository(sql = getPostgresClient()) {
  return {
    async register({userId, token, platform = 'unknown', appVersion = ''}) {
      const rows = await sql`
        insert into notification_devices (id, user_id, token, platform, app_version, last_seen_at, revoked_at, updated_at)
        values (${uuidv4()}, ${String(userId)}, ${String(token)}, ${String(platform)}, ${String(appVersion)}, now(), null, now())
        on conflict (token) do update set
          user_id = excluded.user_id,
          platform = excluded.platform,
          app_version = excluded.app_version,
          last_seen_at = now(),
          revoked_at = null,
          updated_at = now()
        returning *
      `;
      return map(rows[0]);
    },
    async revoke({userId, token}) {
      const rows = await sql`
        update notification_devices set revoked_at = now(), updated_at = now()
        where user_id = ${String(userId)} and token = ${String(token)}
        returning *
      `;
      return map(rows[0]);
    },
    async revokeAllForUser(userId) {
      const rows = await sql`
        update notification_devices set revoked_at = now(), updated_at = now()
        where user_id = ${String(userId)} and revoked_at is null
        returning id
      `;
      return rows.length;
    },
    async listActiveForUser(userId) {
      const rows = await sql`
        select * from notification_devices
        where user_id = ${String(userId)} and revoked_at is null
        order by last_seen_at desc
      `;
      return rows.map(map);
    },
  };
}

module.exports = {createNotificationDeviceRepository};
