const pool = require('../utils/db');

exports.getAll = async ({ system, activeOnly = true } = {}) => {
  const where = [];
  const params = [];
  if (system) { where.push('`system` = ?'); params.push(system); }
  if (activeOnly) where.push('is_active = 1');
  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const [rows] = await pool.query(
    `SELECT id, api_config_id, \`system\`, external_id, contact_id, code, fullname, username,
            department_id, department_name, status, synced_at
     FROM external_users ${whereClause}
     ORDER BY CAST(code AS UNSIGNED), fullname`,
    params
  );
  return rows;
};
