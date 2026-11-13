const pool = require('../utils/db');
const { parseCustomData, normalizeText } = require('./proposalGradingService');

const userId = value => {
  const parsed = typeof value === 'string' && value.trim().startsWith('{')
    ? parseCustomData(value) : value;
  const raw = parsed && typeof parsed === 'object' ? parsed.id : parsed;
  if (!['string', 'number'].includes(typeof raw)) return null;
  if (!/^[0-9]+$/.test(String(raw).trim())) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const build = async ({ id, department, region }, suppliedUsers) => {
  const users = suppliedUsers || (await pool.query('SELECT id, parent_id, custom_data FROM users'))[0];
  const accountIds = new Set(users.map(u => Number(u.id)));
  const branchIds = new Set([Number(id)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const user of users) {
      if (branchIds.has(Number(user.parent_id)) && !branchIds.has(Number(user.id))) {
        branchIds.add(Number(user.id));
        changed = true;
      }
    }
  }
  const dept = normalizeText(department);
  const managedIds = new Set([...branchIds, ...users.filter(u => dept
    && normalizeText(parseCustomData(u.custom_data).department) === dept).map(u => Number(u.id))]);
  return { id: Number(id), region, managedIds, accountIds };
};

const matches = (scope, proposal) => {
  const custom = parseCustomData(proposal.custom_data);
  const owner = userId(proposal.user_id);
  const responsible = userId(custom.nguoi_phu_trach);
  if (userId(custom.sales_quan_ly) === scope.id) return true;
  if ([owner, responsible].some(id => id && scope.managedIds.has(id) && scope.accountIds.has(id))) return true;
  if ([owner, responsible].some(id => scope.accountIds.has(id))) return false;
  return !!scope.region && require('./proposalReviewService').resolveRegion(custom.vung_mien) === scope.region;
};

const sql = (scope, params, alias = 'p') => {
  const ids = [...scope.managedIds].filter(id => scope.accountIds.has(id));
  const fieldId = key => {
    const value = `JSON_EXTRACT(${alias}.custom_data, '$.${key}')`;
    const decoded = `CASE WHEN JSON_VALID(JSON_UNQUOTE(${value})) THEN JSON_UNQUOTE(${value}) ELSE 'null' END`;
    const raw = `TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${decoded}, '$.id')), JSON_UNQUOTE(${value})))`;
    return `CAST(CASE WHEN ${raw} REGEXP '^[0-9]+$' THEN ${raw} ELSE NULL END AS UNSIGNED)`;
  };
  const responsible = fieldId('nguoi_phu_trach');
  const manager = fieldId('sales_quan_ly');
  params.push(scope.id);
  const clauses = [`${manager} = ?`];
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    clauses.push(`${alias}.user_id IN (${placeholders})`, `${responsible} IN (${placeholders})`);
    params.push(...ids, ...ids);
  }
  const pattern = { Bac: '%bac%', Trung: '%trung%', Nam: '%nam%' }[scope.region];
  if (pattern) {
    clauses.push(`(NOT EXISTS (SELECT 1 FROM users ro WHERE ro.id = ${alias}.user_id)
      AND NOT EXISTS (SELECT 1 FROM users rr WHERE rr.id = ${responsible})
      AND LOWER(CONVERT(JSON_UNQUOTE(JSON_EXTRACT(${alias}.custom_data, '$.vung_mien')) USING utf8mb4)) LIKE ?)`);
    params.push(pattern);
  }
  return `(${clauses.join(' OR ')})`;
};

module.exports = { build, matches, sql, userId };
