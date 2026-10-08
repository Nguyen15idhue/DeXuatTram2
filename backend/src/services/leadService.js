const pool = require('../utils/db');
const { isGdtt, isGdkv } = require('../constants/salesRanks');

const parseCustomData = (val) => {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return {}; }
};

const FILTER_COLUMNS = {
  stage: 'l.stage',
  source: 'l.source',
  province: 'l.province',
  region: 'l.region',
  assigned_user_id: 'l.assigned_user_id',
  assigned_department: 'l.assigned_department',
  customer_classification: 'l.customer_classification',
};

// Scope Lead theo contract docs/8/mkt/04 §3 — WHERE clause, khong filter FE.
// Tra ve null (khong gioi han) hoac { sql, params } cho nguoi dung hien tai.
const buildScope = async (user) => {
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return null;

  if (user.role === 'MKT') {
    return { sql: 'l.created_by = ?', params: [user.id] };
  }

  if (user.role === 'SALES') {
    const [rows] = await pool.query('SELECT custom_data FROM users WHERE id = ?', [user.id]);
    const cd = parseCustomData(rows[0] && rows[0].custom_data);
    const department = cd.department || '';

    if (department && isGdtt(cd.chuc_vu, department)) {
      return { sql: 'l.assigned_department = ?', params: [department] };
    }
    if (isGdkv(cd.chuc_vu, department)) {
      return { sql: 'l.assigned_user_id = ?', params: [user.id] };
    }
    // SALES khong phai GĐTT/GĐKV: khong thay lead nao (contract 04 §3)
    return { sql: '1 = 0', params: [] };
  }

  // CTV/NPP khong co quyen Lead — bi chan o middleware, khong duoc vao day
  return { sql: '1 = 0', params: [] };
};

exports.getLeads = async (query, user) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
  const search = String(query.search || '').trim();

  const where = ['l.deleted_at IS NULL'];
  const params = [];

  if (search) {
    where.push('(l.full_name LIKE ? OR l.phone LIKE ? OR l.lead_code LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  Object.keys(FILTER_COLUMNS).forEach((key) => {
    const value = query[key];
    if (value !== undefined && value !== null && value !== '') {
      where.push(`${FILTER_COLUMNS[key]} = ?`);
      params.push(value);
    }
  });

  const scope = await buildScope(user);
  if (scope) {
    where.push(scope.sql);
    params.push(...scope.params);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM leads l ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT l.*, j.journey_code
       FROM leads l
       JOIN business_journeys j ON j.id = l.journey_id
       ${whereSql}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );

  return {
    leads: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

exports.buildScope = buildScope;
