const {v4: uuidv4} = require('uuid');
const {getPostgresClient} = require('../../database/postgresClient');

function createUserSearchOutboxRepository(sql = getPostgresClient()) {
  return {
    async enqueue({userId, payload, operation = 'upsert', eventId}) {
      const id = String(eventId || uuidv4());
      await sql`
        insert into user_search_outbox (id, user_id, operation, payload)
        values (${id}, ${String(userId)}, ${operation}, ${sql.json(payload || {})})
        on conflict do nothing
      `;
    },
    async listPending(limit = 50) {
      await sql`
        update user_search_outbox
        set status = 'retry', next_attempt_at = now(), updated_at = now()
        where status = 'processing' and updated_at < now() - interval '5 minutes'
      `;
      return sql`
        select * from user_search_outbox
        where status in ('pending', 'retry') and next_attempt_at <= now()
        order by created_at asc
        limit ${Number(limit)}
      `;
    },
    async claim(id) {
      const rows = await sql`
        update user_search_outbox
        set status = 'processing', attempts = attempts + 1, updated_at = now()
        where id = ${String(id)} and status in ('pending', 'retry')
        returning id
      `;
      return rows.length > 0;
    },
    markDone(id) {
      return sql`update user_search_outbox set status = 'delivered', updated_at = now() where id = ${String(id)}`;
    },
    markFailed(id) {
      return sql`update user_search_outbox set status = 'retry', next_attempt_at = now() + interval '30 seconds', updated_at = now() where id = ${String(id)}`;
    },
  };
}

module.exports = {createUserSearchOutboxRepository};
