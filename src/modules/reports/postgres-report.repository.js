const { v4: uuidv4 } = require('uuid');
const { getPostgresClient } = require('../../database/postgresClient');

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapReportRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    reporterId: row.reporter_id,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    status: row.status,
    metadata: row.metadata || {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function createPostgresReportRepository(sql = getPostgresClient(), idFactory = uuidv4) {
  async function findActiveReport({reporterId, targetType, targetId}) {
    const rows = await sql`
      select * from reports
      where reporter_id = ${String(reporterId)}
        and target_type = ${String(targetType)}
        and target_id = ${String(targetId)}
        and status = 'open'
      limit 1
    `;
    return mapReportRow(rows[0]);
  }

  return {
    async createActiveReport({reporterId, targetType, targetId, reason, metadata = {}}) {
      const existing = await findActiveReport({reporterId, targetType, targetId});
      if (existing) {
        return {created: false, report: existing};
      }

      const id = idFactory();
      try {
        const rows = await sql`
          insert into reports (
            id, reporter_id, target_type, target_id, reason, status, metadata
          )
          values (
            ${id}, ${String(reporterId)}, ${String(targetType)}, ${String(targetId)},
            ${String(reason)}, 'open', ${metadata}
          )
          returning *
        `;
        return {created: true, report: mapReportRow(rows[0])};
      } catch (err) {
        if (err.code === '23505') {
          return {
            created: false,
            report: await findActiveReport({reporterId, targetType, targetId}),
          };
        }
        throw err;
      }
    },

    async withdrawActiveReport({reporterId, targetType, targetId}) {
      const rows = await sql`
        update reports
        set status = 'withdrawn', updated_at = now()
        where reporter_id = ${String(reporterId)}
          and target_type = ${String(targetType)}
          and target_id = ${String(targetId)}
          and status = 'open'
        returning *
      `;

      return {
        withdrawn: Boolean(rows[0]),
        report: mapReportRow(rows[0]),
      };
    },

    async countOpenReports({targetType, targetId}) {
      const rows = await sql`
        select count(*) as count from reports
        where target_type = ${String(targetType)}
          and target_id = ${String(targetId)}
          and status = 'open'
      `;
      return Number(rows[0]?.count || 0);
    },
  };
}

module.exports = {
  createPostgresReportRepository,
  mapReportRow,
};
