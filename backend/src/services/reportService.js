const pool = require('../utils/db');
const ttlCache = require('../utils/ttlCache');
const leadService = require('./leadService');
const adminProposalService = require('./adminProposalService');

const METRIC_REGISTRY = [
  'lead_funnel',
  'lead_by_stage',
  'lead_by_classification',
  'lead_by_source',
  'lead_by_province',
  'lead_by_region',
  'lead_by_department',
  'lead_by_assignee',
  'proposal_by_status',
  'conversion_rates',
  'average_duration',
  'pipeline_over_time',
  'stuck_items',
  'unassigned_leads',
  'proposals_without_lead',
  'stations_without_proposal',
  'journey_sync_errors',
];

const NON_TERMINAL_PROPOSAL = ['PENDING', 'REVIEWING', 'PRINCIPLE_APPROVED', 'APPROVED', 'ARCHIVED'];
const CACHE_TTL_MS = 45000;
const SAMPLE_LIMIT = 50;

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function parseFilters(query) {
  const f = {
    date_from: query.date_from ? String(query.date_from).slice(0, 10) : null,
    date_to: query.date_to ? String(query.date_to).slice(0, 10) : null,
    region: query.region ? String(query.region) : null,
    department: query.department ? String(query.department) : null,
    source: query.source ? String(query.source) : null,
    stage: query.stage ? String(query.stage) : null,
    assigned_user_id: query.assigned_user_id ? Number(query.assigned_user_id) : null,
    province: query.province ? String(query.province) : null,
  };
  if (f.assigned_user_id !== null && !Number.isFinite(f.assigned_user_id)) {
    throw badRequest('assigned_user_id không hợp lệ');
  }
  let metrics = null;
  if (query.metrics !== undefined && query.metrics !== null && String(query.metrics) !== '') {
    metrics = String(query.metrics).split(',').map((s) => s.trim()).filter(Boolean);
    const unknown = metrics.filter((m) => !METRIC_REGISTRY.includes(m));
    if (unknown.length > 0) throw badRequest(`Metric không hợp lệ: ${unknown.join(', ')}`);
    if (metrics.length === 0) metrics = null;
  }
  return { filters: f, metrics: metrics || [...METRIC_REGISTRY] };
}

async function buildReportScope(user) {
  if (user.role !== 'SALES') return { role: user.role };
  const branchIds = await adminProposalService.getBranchUserIds(user.id);
  return { role: 'SALES', branchIds: (branchIds || []).map(Number), userId: Number(user.id) };
}

async function leadWhere(user, f) {
  const where = ['l.deleted_at IS NULL'];
  const params = [];
  if (f.date_from) { where.push('l.created_at >= ?'); params.push(`${f.date_from} 00:00:00`); }
  if (f.date_to) { where.push('l.created_at <= ?'); params.push(`${f.date_to} 23:59:59`); }
  if (f.region) { where.push('l.region = ?'); params.push(f.region); }
  if (f.department) { where.push('l.assigned_department = ?'); params.push(f.department); }
  if (f.source) { where.push('l.source = ?'); params.push(f.source); }
  if (f.stage) { where.push('l.stage = ?'); params.push(f.stage); }
  if (f.assigned_user_id !== null) { where.push('l.assigned_user_id = ?'); params.push(f.assigned_user_id); }
  if (f.province) { where.push('l.province = ?'); params.push(f.province); }
  const scope = await leadService.buildScope(user);
  if (scope) {
    where.push(`(${scope.sql})`);
    params.push(...scope.params);
  }
  return { where, params };
}

function assigneeJsonClause(alias, userId) {
  return {
    sql: `(CAST(JSON_UNQUOTE(JSON_EXTRACT(${alias}.custom_data, '$.nguoi_phu_trach.id')) AS UNSIGNED) = ? OR CAST(JSON_UNQUOTE(JSON_EXTRACT(${alias}.custom_data, '$.sales_quan_ly.id')) AS UNSIGNED) = ?)`,
    params: [Number(userId), Number(userId)],
  };
}

function proposalScopeClause(scope, user, alias) {
  if (!scope || (scope.role !== 'SALES' && scope.role !== 'MKT')) return null;
  if (scope.role === 'SALES') {
    const ors = [];
    const params = [];
    if (scope.branchIds && scope.branchIds.length > 0) {
      ors.push(`${alias}.user_id IN (${scope.branchIds.map(() => '?').join(',')})`);
      params.push(...scope.branchIds);
    }
    if (scope.userId) {
      const a = assigneeJsonClause(alias, scope.userId);
      ors.push(a.sql);
      params.push(...a.params);
    }
    if (ors.length === 0) return { sql: '1 = 0', params: [] };
    return { sql: `(${ors.join(' OR ')})`, params };
  }
  return {
    sql: `(${alias}.journey_id IN (SELECT l2.journey_id FROM leads l2 WHERE l2.created_by = ? AND l2.deleted_at IS NULL) OR ${alias}.user_id = ?)`,
    params: [Number(user.id), Number(user.id)],
  };
}

function proposalFilters(f, alias) {
  const where = [];
  const params = [];
  if (f.date_from) { where.push(`${alias}.created_at >= ?`); params.push(`${f.date_from} 00:00:00`); }
  if (f.date_to) { where.push(`${alias}.created_at <= ?`); params.push(`${f.date_to} 23:59:59`); }
  if (f.region) { where.push(`JSON_UNQUOTE(JSON_EXTRACT(${alias}.custom_data, '$.vung_mien')) = ?`); params.push(f.region); }
  if (f.province) { where.push(`JSON_UNQUOTE(JSON_EXTRACT(${alias}.custom_data, '$.province')) = ?`); params.push(f.province); }
  if (f.department) {
    where.push(`${alias}.user_id IN (SELECT u.id FROM users u WHERE JSON_UNQUOTE(JSON_EXTRACT(u.custom_data, '$.department')) = ?)`);
    params.push(f.department);
  }
  if (f.assigned_user_id !== null) {
    const a = assigneeJsonClause(alias, f.assigned_user_id);
    where.push(a.sql);
    params.push(...a.params);
  }
  return { where, params };
}

function proposalWhere(scope, user, f, alias) {
  const { where, params } = proposalFilters(f, alias);
  const sc = proposalScopeClause(scope, user, alias);
  if (sc) {
    where.push(sc.sql);
    params.push(...sc.params);
  }
  return { where, params };
}

function stationFilters(f, alias) {
  const where = [];
  const params = [];
  if (f.date_from) { where.push(`${alias}.created_at >= ?`); params.push(`${f.date_from} 00:00:00`); }
  if (f.date_to) { where.push(`${alias}.created_at <= ?`); params.push(`${f.date_to} 23:59:59`); }
  if (f.region) { where.push(`JSON_UNQUOTE(JSON_EXTRACT(${alias}.custom_data, '$.vung_mien')) = ?`); params.push(f.region); }
  if (f.province) { where.push(`JSON_UNQUOTE(JSON_EXTRACT(${alias}.custom_data, '$.province')) = ?`); params.push(f.province); }
  return { where, params };
}

function stationScopeClause(scope, user) {
  if (!scope || (scope.role !== 'SALES' && scope.role !== 'MKT')) return null;
  const inner = proposalScopeClause(scope, user, 'p2');
  if (!inner) return null;
  return {
    sql: `s.id IN (SELECT p2.station_id FROM station_proposals p2 WHERE p2.station_id IS NOT NULL AND ${inner.sql})`,
    params: inner.params,
  };
}

function stationWhere(scope, user, f) {
  const { where, params } = stationFilters(f, 's');
  const sc = stationScopeClause(scope, user);
  if (sc) {
    where.push(sc.sql);
    params.push(...sc.params);
  }
  return { where, params };
}

async function q(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function datasetLeadFunnel(lw) {
  const whereSql = `WHERE ${lw.where.join(' AND ')}`;
  const rows = await q(
    `SELECT COUNT(*) AS total,
       SUM(COALESCE(JSON_LENGTH(JSON_EXTRACT(l.custom_data, '$.cskh_history')), 0) > 0) AS cskh,
       SUM(COALESCE(JSON_LENGTH(JSON_EXTRACT(l.custom_data, '$.tvbh_history')), 0) > 0) AS tvbh,
       SUM(EXISTS(SELECT 1 FROM station_proposals p WHERE p.journey_id = l.journey_id)) AS has_proposal,
       SUM(EXISTS(SELECT 1 FROM station_proposals p WHERE p.journey_id = l.journey_id AND p.station_id IS NOT NULL)) AS has_station,
       SUM(j.current_stage = 'ON') AS on_stage
     FROM leads l LEFT JOIN business_journeys j ON j.id = l.journey_id ${whereSql}`,
    lw.params
  );
  const r = rows[0] || {};
  const num = (v) => Number(v || 0);
  return {
    total: num(r.total), cskh: num(r.cskh), tvbh: num(r.tvbh),
    has_proposal: num(r.has_proposal), has_station: num(r.has_station), on_stage: num(r.on_stage),
  };
}

async function datasetGroupBy(lw, column, label) {
  const rows = await q(
    `SELECT ${column} AS value, COUNT(*) AS total FROM leads l WHERE ${lw.where.join(' AND ')} GROUP BY ${column} ORDER BY total DESC`,
    lw.params
  );
  return rows.map((r) => ({ [label]: r.value, total: Number(r.total) }));
}

async function datasetLeadByAssignee(lw) {
  const rows = await q(
    `SELECT l.assigned_user_id AS id, u.full_name AS name, COUNT(*) AS total
     FROM leads l LEFT JOIN users u ON u.id = l.assigned_user_id
     WHERE ${lw.where.join(' AND ')} GROUP BY l.assigned_user_id, u.full_name ORDER BY total DESC`,
    lw.params
  );
  return rows.map((r) => ({ id: r.id, name: r.name, total: Number(r.total) }));
}

async function datasetProposalByStatus(pw) {
  const cond = pw.where.length > 0 ? `WHERE ${pw.where.join(' AND ')}` : '';
  const rows = await q(`SELECT p.status AS status, COUNT(*) AS total FROM station_proposals p ${cond} GROUP BY p.status ORDER BY total DESC`, pw.params);
  return rows.map((r) => ({ status: r.status, total: Number(r.total) }));
}

function datasetConversion(funnel) {
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
  return {
    lead_to_proposal: pct(funnel.has_proposal, funnel.total),
    lead_to_station: pct(funnel.has_station, funnel.total),
    lead_to_on: pct(funnel.on_stage, funnel.total),
    proposal_to_station: pct(funnel.has_station, funnel.has_proposal),
  };
}

async function datasetAverageDuration(lw, pw) {
  const whereSql = `WHERE ${lw.where.join(' AND ')}`;
  const [a] = await q(
    `SELECT AVG(TIMESTAMPDIFF(DAY, l.created_at, fp.created_at)) AS avg_days
     FROM leads l JOIN (SELECT journey_id, MIN(created_at) AS created_at FROM station_proposals WHERE journey_id IS NOT NULL GROUP BY journey_id) fp ON fp.journey_id = l.journey_id ${whereSql}`,
    lw.params
  );
  const pcond = pw.where.length > 0 ? `AND ${pw.where.join(' AND ')}` : '';
  const [b] = await q(
    `SELECT AVG(TIMESTAMPDIFF(DAY, p.created_at, s.created_at)) AS avg_days
     FROM station_proposals p JOIN stations s ON s.id = p.station_id
     WHERE p.station_id IS NOT NULL ${pcond}`,
    pw.params
  );
  const round1 = (v) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);
  return { lead_to_proposal_days: round1(a && a.avg_days), proposal_to_station_days: round1(b && b.avg_days) };
}

async function datasetPipelineOverTime(lw, pw, sw, f) {
  let from = f.date_from;
  let to = f.date_to;
  if (!from || !to) {
    const [[maxRow]] = await pool.query(
      'SELECT MAX(created_at) AS mx, MIN(created_at) AS mn FROM (SELECT created_at FROM leads UNION ALL SELECT created_at FROM station_proposals UNION ALL SELECT created_at FROM stations) t'
    );
    const mx = maxRow && maxRow.mx ? new Date(maxRow.mx) : new Date();
    to = to || mx.toISOString().slice(0, 10);
    if (!from) {
      const d = new Date(mx);
      d.setDate(d.getDate() - 29);
      from = d.toISOString().slice(0, 10);
    }
  }
  const dayCount = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
  const bucket = dayCount > 62 ? '%Y-%m' : '%Y-%m-%d';
  const rangeWhere = (alias, params) => {
    const w = [`${alias}.created_at >= ?`, `${alias}.created_at <= ?`];
    params.push(`${from} 00:00:00`, `${to} 23:59:59`);
    return w;
  };
  const lp = [...lw.params];
  const lrw = [...lw.where, ...rangeWhere('l', lp)];
  const pp = [...pw.params];
  const prw = [...pw.where, ...rangeWhere('p', pp)];
  const sp = [...sw.params];
  const srw = [...sw.where, ...rangeWhere('s', sp)];
  const [lr] = [await q(`SELECT DATE_FORMAT(l.created_at, '${bucket}') AS d, COUNT(*) AS total FROM leads l WHERE ${lrw.join(' AND ')} GROUP BY d ORDER BY d`, lp)];
  const [pr] = [await q(`SELECT DATE_FORMAT(p.created_at, '${bucket}') AS d, COUNT(*) AS total FROM station_proposals p WHERE ${prw.join(' AND ')} GROUP BY d ORDER BY d`, pp)];
  const [sr] = [await q(`SELECT DATE_FORMAT(s.created_at, '${bucket}') AS d, COUNT(*) AS total FROM stations s WHERE ${srw.join(' AND ')} GROUP BY d ORDER BY d`, sp)];
  const map = new Map();
  const put = (rows, key) => rows.forEach((r) => {
    const k = String(r.d);
    if (!map.has(k)) map.set(k, { date: k, leads: 0, proposals: 0, stations: 0 });
    map.get(k)[key] = Number(r.total);
  });
  put(lr, 'leads'); put(pr, 'proposals'); put(sr, 'stations');
  return { from, to, bucket: bucket === '%Y-%m' ? 'month' : 'day', points: [...map.values()] };
}

async function datasetStuckItems(pw) {
  const cond = [...pw.where];
  const params = [...pw.params];
  cond.push(`p.status IN (${NON_TERMINAL_PROPOSAL.map(() => '?').join(',')})`);
  params.push(...NON_TERMINAL_PROPOSAL);
  cond.push('(p.transition_deadline_at IS NOT NULL AND p.transition_deadline_at < NOW())');
  const whereSql = `WHERE ${cond.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM station_proposals p ${whereSql}`, params);
  const rows = await q(
    `SELECT p.id, p.ma_de_xuat_gen AS code, p.status, p.created_at, p.transition_deadline_at AS deadline
     FROM station_proposals p ${whereSql} ORDER BY p.transition_deadline_at ASC LIMIT ${SAMPLE_LIMIT}`,
    params
  );
  return { total: Number(total), items: rows };
}

async function datasetUnassignedLeads(lw) {
  const whereSql = `WHERE ${[...lw.where, 'l.assigned_user_id IS NULL'].join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM leads l ${whereSql}`, lw.params);
  const rows = await q(
    `SELECT l.id, l.lead_code AS code, l.full_name AS name, l.phone, l.created_at FROM leads l ${whereSql} ORDER BY l.created_at DESC LIMIT ${SAMPLE_LIMIT}`,
    lw.params
  );
  return { total: Number(total), items: rows };
}

async function datasetProposalsWithoutLead(pw) {
  const cond = [...pw.where, 'p.journey_id IS NULL'];
  const whereSql = `WHERE ${cond.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM station_proposals p ${whereSql}`, pw.params);
  const rows = await q(
    `SELECT p.id, p.ma_de_xuat_gen AS code, p.status, p.created_at FROM station_proposals p ${whereSql} ORDER BY p.created_at DESC LIMIT ${SAMPLE_LIMIT}`,
    pw.params
  );
  return { total: Number(total), items: rows };
}

async function datasetStationsWithoutProposal(sw) {
  const cond = [...sw.where, 'NOT EXISTS (SELECT 1 FROM station_proposals p WHERE p.station_id = s.id)'];
  const whereSql = `WHERE ${cond.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM stations s ${whereSql}`, sw.params);
  const rows = await q(
    `SELECT s.id, s.name, s.status, s.created_at FROM stations s ${whereSql} ORDER BY s.created_at DESC LIMIT ${SAMPLE_LIMIT}`,
    sw.params
  );
  return { total: Number(total), items: rows };
}

async function datasetJourneySyncErrors(pw) {
  const cond = [...pw.where, `p.sync_status = 'error'`];
  const whereSql = `WHERE ${cond.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM station_proposals p ${whereSql}`, pw.params);
  const rows = await q(
    `SELECT p.id, p.ma_de_xuat_gen AS code, p.sync_status, p.last_synced_at FROM station_proposals p ${whereSql} ORDER BY p.last_synced_at DESC LIMIT ${SAMPLE_LIMIT}`,
    pw.params
  );
  return { total: Number(total), items: rows };
}

exports.METRIC_REGISTRY = METRIC_REGISTRY;
exports.NON_TERMINAL_PROPOSAL = NON_TERMINAL_PROPOSAL;

exports.getPipeline = async (query, user) => {
  const { filters, metrics } = parseFilters(query || {});
  const scope = await buildReportScope(user);
  const cacheKey = `reports:pipeline:${user.id}:${user.role}:${JSON.stringify(filters)}:${metrics.join(',')}`;
  const cached = ttlCache.get(cacheKey);
  if (cached) return { ...cached, cached: true };

  const lw = await leadWhere(user, filters);
  const pw = proposalWhere(scope, user, filters, 'p');
  const sw = stationWhere(scope, user, filters);

  const need = (m) => metrics.includes(m);
  const tasks = {};
  if (need('lead_funnel')) tasks.lead_funnel = datasetLeadFunnel(lw);
  if (need('lead_by_stage')) tasks.lead_by_stage = datasetGroupBy(lw, 'l.stage', 'stage');
  if (need('lead_by_classification')) tasks.lead_by_classification = datasetGroupBy(lw, 'l.customer_classification', 'classification');
  if (need('lead_by_source')) tasks.lead_by_source = datasetGroupBy(lw, 'l.source', 'source');
  if (need('lead_by_province')) tasks.lead_by_province = datasetGroupBy(lw, 'l.province', 'province');
  if (need('lead_by_region')) tasks.lead_by_region = datasetGroupBy(lw, 'l.region', 'region');
  if (need('lead_by_department')) tasks.lead_by_department = datasetGroupBy(lw, 'l.assigned_department', 'department');
  if (need('lead_by_assignee')) tasks.lead_by_assignee = datasetLeadByAssignee(lw);
  if (need('proposal_by_status')) tasks.proposal_by_status = datasetProposalByStatus(pw);
  if (need('average_duration')) tasks.average_duration = datasetAverageDuration(lw, pw);
  if (need('pipeline_over_time')) tasks.pipeline_over_time = datasetPipelineOverTime(lw, pw, sw, filters);
  if (need('stuck_items')) tasks.stuck_items = datasetStuckItems(pw);
  if (need('unassigned_leads')) tasks.unassigned_leads = datasetUnassignedLeads(lw);
  if (need('proposals_without_lead')) tasks.proposals_without_lead = datasetProposalsWithoutLead(pw);
  if (need('stations_without_proposal')) tasks.stations_without_proposal = datasetStationsWithoutProposal(sw);
  if (need('journey_sync_errors')) tasks.journey_sync_errors = datasetJourneySyncErrors(pw);

  const keys = Object.keys(tasks);
  const values = await Promise.all(keys.map((k) => tasks[k]));
  const datasets = {};
  keys.forEach((k, i) => { datasets[k] = values[i]; });
  if (need('conversion_rates')) {
    const funnel = datasets.lead_funnel || await datasetLeadFunnel(lw);
    datasets.lead_funnel = funnel;
    datasets.conversion_rates = datasetConversion(funnel);
  }

  const result = {
    filters,
    metrics,
    generated_at: new Date().toISOString(),
    datasets,
  };
  ttlCache.set(cacheKey, result, CACHE_TTL_MS);
  return { ...result, cached: false };
};

exports.buildReportScope = buildReportScope;
exports.proposalScopeClause = proposalScopeClause;
