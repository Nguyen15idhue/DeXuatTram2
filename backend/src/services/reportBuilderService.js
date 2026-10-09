const pool = require('../utils/db');
const reportService = require('./reportService');

const MAX_ROWS = 200;
const MAX_FILTERS = 10;

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

const DATASETS = {
  leads: {
    label: 'Leads',
    from: 'leads l',
    dimensions: {
      stage: { label: 'Stage', sql: 'l.stage' },
      customer_classification: { label: 'Phân loại KH', sql: 'l.customer_classification' },
      source: { label: 'Nguồn', sql: 'l.source' },
      province: { label: 'Tỉnh/Thành', sql: 'l.province' },
      region: { label: 'Vùng miền', sql: 'l.region' },
      assigned_department: { label: 'Phòng ban', sql: 'l.assigned_department' },
      created_date: { label: 'Ngày tạo', sql: 'DATE(l.created_at)' },
      created_month: { label: 'Tháng tạo', sql: "DATE_FORMAT(l.created_at, '%Y-%m')" },
    },
    metrics: {
      id: { label: 'Số lượng', sql: 'l.id', type: 'number', aggs: ['count', 'count_distinct'] },
    },
    scope: async (user) => reportService.leadWhereClause(user, {}),
    baseFilter: 'l.deleted_at IS NULL',
  },
  proposals: {
    label: 'Đề xuất',
    from: 'station_proposals p',
    dimensions: {
      status: { label: 'Trạng thái', sql: 'p.status' },
      province: { label: 'Tỉnh/Thành', sql: "JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.province'))" },
      region: { label: 'Vùng miền', sql: "JSON_UNQUOTE(JSON_EXTRACT(p.custom_data, '$.vung_mien'))" },
      created_date: { label: 'Ngày tạo', sql: 'DATE(p.created_at)' },
      created_month: { label: 'Tháng tạo', sql: "DATE_FORMAT(p.created_at, '%Y-%m')" },
    },
    metrics: {
      id: { label: 'Số lượng', sql: 'p.id', type: 'number', aggs: ['count', 'count_distinct'] },
    },
    scope: async (user) => {
      const scope = await reportService.buildReportScope(user);
      return reportService.proposalWhereClause(scope, user, {}, 'p');
    },
  },
  stations: {
    label: 'Trạm',
    from: 'stations s',
    dimensions: {
      status: { label: 'Trạng thái', sql: 's.status' },
      province: { label: 'Tỉnh/Thành', sql: "JSON_UNQUOTE(JSON_EXTRACT(s.custom_data, '$.province'))" },
      region: { label: 'Vùng miền', sql: "JSON_UNQUOTE(JSON_EXTRACT(s.custom_data, '$.vung_mien'))" },
      created_date: { label: 'Ngày tạo', sql: 'DATE(s.created_at)' },
      created_month: { label: 'Tháng tạo', sql: "DATE_FORMAT(s.created_at, '%Y-%m')" },
    },
    metrics: {
      id: { label: 'Số lượng', sql: 's.id', type: 'number', aggs: ['count', 'count_distinct'] },
    },
    scope: async (user) => {
      const scope = await reportService.buildReportScope(user);
      return reportService.stationWhereClause(scope, user, {});
    },
  },
  journey_events: {
    label: 'Sự kiện hành trình',
    from: 'journey_activity_logs j JOIN leads l ON l.journey_id = j.journey_id',
    dimensions: {
      action: { label: 'Loại sự kiện', sql: 'j.action' },
      entity_type: { label: 'Đối tượng', sql: 'j.entity_type' },
      actor_role: { label: 'Vai trò actor', sql: 'j.actor_role' },
      created_date: { label: 'Ngày', sql: 'DATE(j.created_at)' },
      created_month: { label: 'Tháng', sql: "DATE_FORMAT(j.created_at, '%Y-%m')" },
    },
    metrics: {
      id: { label: 'Số lượng', sql: 'j.id', type: 'number', aggs: ['count', 'count_distinct'] },
    },
    scope: async (user) => {
      const lw = await reportService.leadWhereClause(user, {});
      return {
        where: [`j.journey_id IN (SELECT l.journey_id FROM leads l WHERE ${lw.where.join(' AND ')})`],
        params: lw.params,
      };
    },
    baseFilter: 'l.deleted_at IS NULL',
  },
  oneoffice_mirror: {
    label: 'Gương 1Office',
    from: 'automation_sync_snapshots s',
    dimensions: {
      version: { label: 'Version', sql: 's.version' },
      proposal_code: { label: 'Mã đề xuất', sql: 's.proposal_code' },
      synced_date: { label: 'Ngày sync', sql: 'DATE(s.updated_at)' },
    },
    metrics: {
      process_id: { label: 'Số process', sql: 's.process_id', type: 'number', aggs: ['count', 'count_distinct'] },
    },
    scope: async (user) => {
      const scope = await reportService.buildReportScope(user);
      if (!scope || (scope.role !== 'SALES' && scope.role !== 'MKT')) return { where: [], params: [] };
      const codes = await reportService.inScopeProposalCodes(scope, user, {}, 2000);
      if (!codes || codes.length === 0) return { where: ['1 = 0'], params: [] };
      return { where: [`s.proposal_code IN (${codes.map(() => '?').join(',')})`], params: codes };
    },
  },
  automation_runs: {
    label: 'Lượt chạy automation',
    from: 'work_automation_runs r',
    dimensions: {
      status: { label: 'Trạng thái', sql: 'r.status' },
      action: { label: 'Hành động', sql: 'r.action' },
      trigger: { label: 'Trigger', sql: 'r.`trigger`' },
      created_date: { label: 'Ngày', sql: 'DATE(r.created_at)' },
      created_month: { label: 'Tháng', sql: "DATE_FORMAT(r.created_at, '%Y-%m')" },
    },
    metrics: {
      id: { label: 'Số lượng', sql: 'r.id', type: 'number', aggs: ['count', 'count_distinct'] },
    },
    scope: async (user) => {
      const scope = await reportService.buildReportScope(user);
      if (!scope || (scope.role !== 'SALES' && scope.role !== 'MKT')) return { where: [], params: [] };
      const codes = await reportService.inScopeProposalCodes(scope, user, {}, 2000);
      if (!codes || codes.length === 0) return { where: ['1 = 0'], params: [] };
      return { where: [`r.proposal_code IN (${codes.map(() => '?').join(',')})`], params: codes };
    },
  },
};

const FILTER_OPS = ['=', '!=', '>', '>=', '<', '<=', 'LIKE'];
const SORTS = ['value_desc', 'value_asc', 'dim_asc', 'dim_desc'];

function validateWidget(input) {
  if (!input || typeof input !== 'object') throw badRequest('Widget không hợp lệ');
  const dsKey = String(input.dataset || '').trim();
  const ds = DATASETS[dsKey];
  if (!ds) throw badRequest(`Dataset không hợp lệ: ${dsKey || '(trống)'}`);
  const dimKey = String(input.dimension || '').trim();
  const dim = ds.dimensions[dimKey];
  if (!dim) throw badRequest(`Dimension không hợp lệ: ${dimKey || '(trống)'}`);
  const metricKey = String(input.metric || '').trim();
  const metric = ds.metrics[metricKey];
  if (!metric) throw badRequest(`Metric không hợp lệ: ${metricKey || '(trống)'}`);
  const agg = String(input.agg || 'count').trim();
  if (!metric.aggs.includes(agg)) throw badRequest(`Phép gộp không hợp lệ: ${agg}`);
  const chart = input.chart === undefined || input.chart === null || input.chart === '' ? 'bar' : String(input.chart);
  if (!reportService.CHART_WHITELIST.includes(chart)) throw badRequest(`Chart không hợp lệ: ${chart}`);
  const size = input.size === undefined || input.size === null || input.size === '' ? 'md' : String(input.size);
  if (!reportService.SIZE_WHITELIST.includes(size)) throw badRequest(`Size không hợp lệ: ${size}`);
  const filters = [];
  const rawFilters = Array.isArray(input.filters) ? input.filters : [];
  if (rawFilters.length > MAX_FILTERS) throw badRequest(`Tối đa ${MAX_FILTERS} filter`);
  rawFilters.forEach((fl, i) => {
    if (!fl || typeof fl !== 'object') throw badRequest(`Filter #${i + 1} không hợp lệ`);
    const fKey = String(fl.key || '').trim();
    const fDef = ds.dimensions[fKey];
    if (!fDef) throw badRequest(`Filter field không hợp lệ: ${fKey || '(trống)'}`);
    const op = String(fl.op || '=').trim().toUpperCase();
    if (!FILTER_OPS.includes(op)) throw badRequest(`Filter op không hợp lệ: ${op}`);
    const val = fl.value === undefined || fl.value === null ? '' : String(fl.value).slice(0, 100);
    filters.push({ key: fKey, op, value: op === 'LIKE' ? `%${val}%` : val });
  });
  const sort = input.sort === undefined || input.sort === null || input.sort === '' ? 'value_desc' : String(input.sort);
  if (!SORTS.includes(sort)) throw badRequest(`Sort không hợp lệ: ${sort}`);
  let limit = input.limit === undefined || input.limit === null || input.limit === '' ? 20 : Number(input.limit);
  if (!Number.isFinite(limit)) throw badRequest('Limit không hợp lệ');
  limit = Math.min(Math.max(Math.round(limit), 1), MAX_ROWS);
  return {
    dataset: dsKey,
    dimension: dimKey,
    metric: metricKey,
    agg,
    chart,
    size,
    title: input.title !== undefined && input.title !== null && String(input.title) !== '' ? String(input.title).slice(0, 120) : `${metric.label} theo ${dim.label}`,
    filters,
    sort,
    limit,
  };
}

function aggSql(agg, col) {
  if (agg === 'count') return 'COUNT(*)';
  if (agg === 'count_distinct') return `COUNT(DISTINCT ${col})`;
  if (agg === 'sum') return `SUM(${col})`;
  if (agg === 'avg') return `AVG(${col})`;
  if (agg === 'min') return `MIN(${col})`;
  return `MAX(${col})`;
}

async function compileWidget(input, user) {
  const w = validateWidget(input);
  const ds = DATASETS[w.dataset];
  const dim = ds.dimensions[w.dimension];
  const metric = ds.metrics[w.metric];
  const sc = await ds.scope(user);
  const where = [...(sc.where || [])];
  const params = [...(sc.params || [])];
  if (ds.baseFilter) where.push(ds.baseFilter);
  w.filters.forEach((fl) => {
    const col = ds.dimensions[fl.key].sql;
    where.push(`${col} ${fl.op} ?`);
    params.push(fl.value);
  });
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const orderBy = w.sort === 'value_asc' ? 'value ASC, dim ASC'
    : w.sort === 'dim_asc' ? 'dim ASC'
    : w.sort === 'dim_desc' ? 'dim DESC'
    : 'value DESC, dim ASC';
  const sql = `SELECT ${dim.sql} AS dim, ${aggSql(w.agg, metric.sql)} AS value FROM ${ds.from} ${whereSql} GROUP BY ${dim.sql} ORDER BY ${orderBy} LIMIT ${w.limit}`;
  const [rows] = await pool.query(sql, params);
  return {
    widget: w,
    columns: ['dim', 'value'],
    rows: rows.map((r) => ({ dim: r.dim === null || r.dim === undefined ? null : String(r.dim), value: Number(r.value) })),
  };
}

function getCatalog() {
  const out = {};
  Object.entries(DATASETS).forEach(([key, ds]) => {
    const dimensions = {};
    Object.entries(ds.dimensions).forEach(([k, d]) => { dimensions[k] = { label: d.label }; });
    const metrics = {};
    Object.entries(ds.metrics).forEach(([k, m]) => { metrics[k] = { label: m.label, type: m.type, aggs: m.aggs }; });
    out[key] = { label: ds.label, dimensions, metrics, sorts: SORTS, charts: reportService.CHART_WHITELIST };
  });
  return out;
}

async function validateDashboardBody(body) {
  if (!body || typeof body !== 'object') throw badRequest('Body không hợp lệ');
  const name = body.name !== undefined && body.name !== null ? String(body.name).trim().slice(0, 120) : '';
  if (!name) throw badRequest('Tên dashboard là bắt buộc');
  const rawWidgets = Array.isArray(body.widgets) ? body.widgets : [];
  if (rawWidgets.length === 0) throw badRequest('Dashboard cần ít nhất 1 widget');
  if (rawWidgets.length > 20) throw badRequest('Tối đa 20 widget');
  return { name, widgets: rawWidgets.map(validateWidget) };
}

async function createDashboard(body, userId) {
  const { name, widgets } = await validateDashboardBody(body);
  try {
    const [r] = await pool.query(
      'INSERT INTO report_builder_dashboards (name, layout_json, created_by, updated_by) VALUES (?, ?, ?, ?)',
      [name, JSON.stringify({ widgets }), userId || null, userId || null]
    );
    return getDashboard(r.insertId);
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') throw badRequest('Tên dashboard đã tồn tại');
    throw e;
  }
}

async function listDashboards() {
  const [rows] = await pool.query(
    'SELECT id, name, created_by, updated_by, created_at, updated_at FROM report_builder_dashboards ORDER BY updated_at DESC'
  );
  return rows;
}

async function getDashboard(id) {
  const nid = Number(id);
  if (!Number.isFinite(nid)) throw badRequest('Dashboard không hợp lệ');
  const [rows] = await pool.query('SELECT * FROM report_builder_dashboards WHERE id = ? LIMIT 1', [nid]);
  if (rows.length === 0) throw Object.assign(new Error('Không tìm thấy dashboard'), { statusCode: 404 });
  const row = rows[0];
  let layout = null;
  try {
    layout = typeof row.layout_json === 'string' ? JSON.parse(row.layout_json) : row.layout_json;
  } catch { layout = null; }
  return {
    id: row.id,
    name: row.name,
    widgets: layout && Array.isArray(layout.widgets) ? layout.widgets : [],
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function updateDashboard(id, body, userId) {
  const current = await getDashboard(id);
  const name = body.name !== undefined && body.name !== null ? String(body.name).trim().slice(0, 120) : current.name;
  if (!name) throw badRequest('Tên dashboard là bắt buộc');
  const widgets = body.widgets !== undefined ? (Array.isArray(body.widgets) ? body.widgets : []) : current.widgets;
  if (widgets.length === 0) throw badRequest('Dashboard cần ít nhất 1 widget');
  if (widgets.length > 20) throw badRequest('Tối đa 20 widget');
  const parsed = widgets.map(validateWidget);
  try {
    await pool.query(
      'UPDATE report_builder_dashboards SET name = ?, layout_json = ?, updated_by = ? WHERE id = ?',
      [name, JSON.stringify({ widgets: parsed }), userId || null, current.id]
    );
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') throw badRequest('Tên dashboard đã tồn tại');
    throw e;
  }
  return getDashboard(current.id);
}

async function deleteDashboard(id) {
  const current = await getDashboard(id);
  await pool.query('DELETE FROM report_builder_dashboards WHERE id = ?', [current.id]);
  return { id: current.id };
}

module.exports = {
  DATASETS: Object.keys(DATASETS),
  FILTER_OPS,
  SORTS,
  MAX_ROWS,
  getCatalog,
  validateWidget,
  compileWidget,
  createDashboard,
  listDashboards,
  getDashboard,
  updateDashboard,
  deleteDashboard,
};
