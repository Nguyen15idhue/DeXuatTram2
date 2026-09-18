const pool = require('../utils/db');

exports.list = async ({ id, proposalId, code, actor, action, source, dateFrom, dateTo, page = 1, limit = 20, scope = {} }) => {
  const where = [];
  const params = [];
  const joins = `LEFT JOIN station_proposals p ON p.id = l.proposal_id
    LEFT JOIN users u ON u.id = l.actor_id`;

  if (scope.role === 'SALES' && scope.branchIds) {
    if (scope.branchIds.length === 0) {
      return { items: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }
    where.push(`l.proposal_id IN (SELECT id FROM station_proposals WHERE user_id IN (${scope.branchIds.map(() => '?').join(',')}))`);
    params.push(...scope.branchIds);
  }

  if (id) {
    where.push('l.id = ?');
    params.push(Number(id));
  }

  if (proposalId) {
    where.push('l.proposal_id = ?');
    params.push(Number(proposalId));
  }

  if (code) {
    where.push(`(JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.ma_de_xuat')) LIKE ? OR p.tracking_code LIKE ? OR p.ma_de_xuat_gen LIKE ?)`);
    params.push(`%${code}%`, `%${code}%`, `%${code}%`);
  }

  if (actor) {
    where.push('u.full_name LIKE ?');
    params.push(`%${actor}%`);
  }

  if (action) {
    where.push('l.action = ?');
    params.push(action);
  }
  if (source) {
    where.push('l.source = ?');
    params.push(source);
  }
  if (dateFrom) {
    where.push('l.created_at >= ?');
    params.push(`${dateFrom} 00:00:00`);
  }
  if (dateTo) {
    where.push('l.created_at <= ?');
    params.push(`${dateTo} 23:59:59`);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const offset = (Math.max(1, page) - 1) * limit;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM proposal_activity_logs l ${joins} ${whereClause}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT l.*, p.tracking_code, p.ma_de_xuat_gen, p.owner_name,
            JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.ma_de_xuat')) AS ma_de_xuat,
            u.full_name AS actor_name
     FROM proposal_activity_logs l
     ${joins}
     ${whereClause}
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), offset]
  );

  return { items: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

exports.timeline = async (proposalId) => {
  const [rows] = await pool.query(
    `SELECT l.*, u.full_name AS actor_name
     FROM proposal_activity_logs l
     LEFT JOIN users u ON u.id = l.actor_id
     WHERE l.proposal_id = ?
     ORDER BY l.created_at ASC, l.id ASC`,
    [Number(proposalId)]
  );
  return rows;
};
