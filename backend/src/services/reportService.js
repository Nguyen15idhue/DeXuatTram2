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
  'lead360_sections',
];

const NON_TERMINAL_PROPOSAL = [
  'PENDING', 'REVIEWING', 'PRINCIPLE_APPROVED', 'APPROVED', 'ARCHIVED',
  'GRADING', 'GDTTKD_EVALUATING', 'RE_GRADING', 'RE_GDTTKD_EVALUATING', 'TGD_REVIEW', 'DESIGNING', 'INFOR_WAITING',
  'PROPOSAL_REPORT_CREATING', 'PROPOSAL_REPORT_RE_CREATING', 'PROPOSAL_REPORT_REVIEWING', 'PROPOSAL_REPORT_UPDATING', 'SIGNATURE_PENDING'
];
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
  if (f.assigned_user_id !== null && f.assigned_user_id !== undefined) { where.push('l.assigned_user_id = ?'); params.push(f.assigned_user_id); }
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
  if (f.assigned_user_id !== null && f.assigned_user_id !== undefined) {
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
  if (need('lead360_sections')) tasks.lead360_sections = datasetLead360Sections();

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

const DETAIL_MAX_LIMIT = 200;

function parsePaging(query) {
  let page = parseInt(query && query.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  let limit = parseInt(query && query.limit, 10);
  if (!Number.isFinite(limit)) limit = 20;
  limit = Math.min(Math.max(limit, 1), DETAIL_MAX_LIMIT);
  return { page, limit };
}

const STAGE_DEFS = [
  { key: 'new_to_assigned', label: 'Tạo → Giao' },
  { key: 'assigned_to_proposal', label: 'Giao → Đề xuất' },
  { key: 'proposal_to_contract', label: 'Đề xuất → Ký' },
  { key: 'contract_to_station', label: 'Ký → Trạm' },
  { key: 'station_to_on', label: 'Trạm → ON' },
];

function parseLeadCustomData(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return {}; }
}

function journeyMilestones(logs, lead) {
  const first = (pred) => {
    const l = (logs || []).find(pred);
    return l ? l.created_at : null;
  };
  return {
    tCreated: first((l) => l.action === 'lead_created') || lead.created_at || null,
    tAssigned: first((l) => l.action === 'assigned') || lead.assigned_at || null,
    tProposed: first((l) => l.action === 'proposal_created'),
    tContract: first((l) => l.action === 'proposal_status_changed' && l.status_after === 'CONTRACT_SIGNED'),
    tStation: first((l) => l.action === 'station_created'),
    tOn: first((l) => l.action === 'station_status_changed' && l.status_after === 'ACTIVE'),
  };
}

function journeyDurations(m) {
  return {
    new_to_assigned_days: dayDiff(m.tCreated, m.tAssigned),
    assigned_to_proposal_days: dayDiff(m.tAssigned, m.tProposed),
    proposal_to_contract_days: dayDiff(m.tProposed, m.tContract),
    contract_to_station_days: dayDiff(m.tContract, m.tStation),
    station_to_on_days: dayDiff(m.tStation, m.tOn),
  };
}

async function queryLeadDetails(filters, user, page, limit) {
  const lw = await leadWhere(user, filters);
  const whereSql = `WHERE ${lw.where.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM leads l ${whereSql}`, lw.params);
  const [rows] = await pool.query(
    `SELECT l.*, j.journey_code, j.current_stage AS journey_stage, u.full_name AS assignee_name
     FROM leads l LEFT JOIN business_journeys j ON j.id = l.journey_id
     LEFT JOIN users u ON u.id = l.assigned_user_id
     ${whereSql} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
    [...lw.params, limit, (page - 1) * limit]
  );

  const journeyIds = [...new Set(rows.map((r) => r.journey_id).filter(Boolean))];
  const logsByJourney = {};
  const propsByJourney = {};
  if (journeyIds.length > 0) {
    const ph = journeyIds.map(() => '?').join(',');
    const [logs] = await pool.query(
      `SELECT journey_id, action, status_after, created_at FROM journey_activity_logs
       WHERE journey_id IN (${ph}) ORDER BY created_at ASC, id ASC`,
      journeyIds
    );
    logs.forEach((l) => {
      (logsByJourney[l.journey_id] = logsByJourney[l.journey_id] || []).push(l);
    });
    const [props] = await pool.query(
      `SELECT p.journey_id, p.id, p.ma_de_xuat_gen AS code, p.status, p.station_id, p.created_at,
              s.name AS station_name, s.status AS station_status
       FROM station_proposals p LEFT JOIN stations s ON s.id = p.station_id
       WHERE p.journey_id IN (${ph}) ORDER BY p.created_at ASC`,
      journeyIds
    );
    props.forEach((p) => {
      (propsByJourney[p.journey_id] = propsByJourney[p.journey_id] || []).push({
        id: p.id, code: p.code, status: p.status, station_id: p.station_id,
        station_name: p.station_name, station_status: p.station_status, created_at: p.created_at,
      });
    });
  }

  const items = rows.map((r) => {
    const m = journeyMilestones(logsByJourney[r.journey_id], r);
    const durations = journeyDurations(m);
    const cd = parseLeadCustomData(r.custom_data);
    const plist = propsByJourney[r.journey_id] || [];
    const seen = new Set();
    const stations = [];
    plist.forEach((p) => {
      if (p.station_id && !seen.has(p.station_id)) {
        seen.add(p.station_id);
        stations.push({ id: p.station_id, name: p.station_name, status: p.station_status });
      }
    });
    return {
      id: r.id, lead_code: r.lead_code, full_name: r.full_name, phone: r.phone,
      stage: r.stage, customer_classification: r.customer_classification, source: r.source,
      province: r.province, region: r.region, created_at: r.created_at,
      assigned_user_id: r.assigned_user_id, assignee_name: r.assignee_name || null,
      assigned_department: r.assigned_department, assigned_at: r.assigned_at,
      cskh_count: Array.isArray(cd.cskh_history) ? cd.cskh_history.length : 0,
      tvbh_count: Array.isArray(cd.tvbh_history) ? cd.tvbh_history.length : 0,
      sales_outcome: r.sales_outcome,
      journey_stage: r.journey_stage, journey_code: r.journey_code,
      on_at: m.tOn, total_days: dayDiff(m.tCreated, m.tOn),
      durations, proposals: plist, stations,
    };
  });

  return {
    items,
    pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) },
  };
}

exports.getLeadDetails = async (query, user) => {
  const { filters } = parseFilters(query || {});
  const { page, limit } = parsePaging(query || {});
  const cacheKey = `reports:lead-details:${user.id}:${user.role}:${JSON.stringify(filters)}:${page}:${limit}`;
  const cached = ttlCache.get(cacheKey);
  if (cached) return { ...cached, cached: true };

  const { items, pagination } = await queryLeadDetails(filters, user, page, limit);
  const result = { items, pagination, generated_at: new Date().toISOString() };
  ttlCache.set(cacheKey, result, CACHE_TTL_MS);
  return { ...result, cached: false };
};

const EXCEL_MAX_ROWS = 5000;

function stampName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function detailRowToExcel(r) {
  const fmtDate = (v) => (v ? new Date(v).toLocaleString('vi-VN') : '');
  return {
    'Mã Lead': r.lead_code || '',
    'Họ tên': r.full_name || '',
    'SĐT': r.phone || '',
    'Stage': r.stage || '',
    'Phân loại': r.customer_classification || '',
    'Nguồn': r.source || '',
    'Tỉnh/Thành': r.province || '',
    'Vùng': r.region || '',
    'Ngày tạo': fmtDate(r.created_at),
    'Người phụ trách': r.assignee_name || '',
    'Phòng ban': r.assigned_department || '',
    'Ngày giao': fmtDate(r.assigned_at),
    'Số lần CSKH': r.cskh_count || 0,
    'Số lần TVBH': r.tvbh_count || 0,
    'Kết quả TVBH': r.sales_outcome || '',
    'Stage hành trình': r.journey_stage || '',
    'Đề xuất': (r.proposals || []).map((p) => `${p.code || `#${p.id}`} (${p.status})`).join('; '),
    'Trạm': (r.stations || []).map((s) => `${s.name || `#${s.id}`} (${s.status})`).join('; '),
    'Ngày ON': fmtDate(r.on_at),
    'Tổng số ngày': r.total_days === null || r.total_days === undefined ? '' : r.total_days,
    'Tạo→Giao (ngày)': r.durations.new_to_assigned_days ?? '',
    'Giao→Đề xuất (ngày)': r.durations.assigned_to_proposal_days ?? '',
    'Đề xuất→Ký (ngày)': r.durations.proposal_to_contract_days ?? '',
    'Ký→Trạm (ngày)': r.durations.contract_to_station_days ?? '',
    'Trạm→ON (ngày)': r.durations.station_to_on_days ?? '',
  };
}

exports.exportReportExcel = async (body, query, user) => {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Bao cao');
  let filename;
  let truncated = false;

  if (body && body.detail) {
    const { filters } = parseFilters((body && body.filters) || query || {});
    const { items, pagination } = await queryLeadDetails(filters, user, 1, EXCEL_MAX_ROWS + 1);
    const rows = items.slice(0, EXCEL_MAX_ROWS).map(detailRowToExcel);
    truncated = items.length > EXCEL_MAX_ROWS;
    if (rows.length > 0) {
      ws.columns = Object.keys(rows[0]).map((k) => ({ header: k, key: k, width: 20 }));
      rows.forEach((r) => ws.addRow(r));
      ws.getRow(1).font = { bold: true };
    }
    filename = `bao_cao_chi_tiet_lead_${stampName()}.xlsx`;
    void pagination;
  } else {
    if (!body || !body.widget) throw badRequest('Thiếu widget để xuất');
    const reportBuilderService = require('./reportBuilderService');
    const out = await reportBuilderService.compileWidget(body.widget, user, EXCEL_MAX_ROWS + 1);
    const rows = out.rows.slice(0, EXCEL_MAX_ROWS);
    truncated = out.rows.length > EXCEL_MAX_ROWS;
    ws.columns = [
      { header: out.widget.title || 'Nhóm', key: 'dim', width: 30 },
      { header: 'Giá trị', key: 'value', width: 15 },
    ];
    rows.forEach((r) => ws.addRow({ dim: r.dim === null ? '(Trống)' : r.dim, value: r.value }));
    ws.getRow(1).font = { bold: true };
    filename = `${(out.widget.title || 'bao_cao').replace(/[^\w\-]+/g, '_').slice(0, 60)}_${stampName()}.xlsx`;
  }

  const buffer = await wb.xlsx.writeBuffer();
  return { filename, buffer, truncated };
};

exports.getStageDurations = async (query, user) => {
  const { filters } = parseFilters(query || {});
  const cacheKey = `reports:stage-durations:${user.id}:${user.role}:${JSON.stringify(filters)}`;
  const cached = ttlCache.get(cacheKey);
  if (cached) return { ...cached, cached: true };

  const lw = await leadWhere(user, filters);
  const whereSql = `WHERE ${lw.where.join(' AND ')}`;
  const [rows] = await pool.query(
    `SELECT
       COUNT(CASE WHEN d.d1 >= 0 THEN 1 END) AS n1, AVG(CASE WHEN d.d1 >= 0 THEN d.d1 END) AS avg1, MIN(CASE WHEN d.d1 >= 0 THEN d.d1 END) AS min1, MAX(CASE WHEN d.d1 >= 0 THEN d.d1 END) AS max1,
       COUNT(CASE WHEN d.d2 >= 0 THEN 1 END) AS n2, AVG(CASE WHEN d.d2 >= 0 THEN d.d2 END) AS avg2, MIN(CASE WHEN d.d2 >= 0 THEN d.d2 END) AS min2, MAX(CASE WHEN d.d2 >= 0 THEN d.d2 END) AS max2,
       COUNT(CASE WHEN d.d3 >= 0 THEN 1 END) AS n3, AVG(CASE WHEN d.d3 >= 0 THEN d.d3 END) AS avg3, MIN(CASE WHEN d.d3 >= 0 THEN d.d3 END) AS min3, MAX(CASE WHEN d.d3 >= 0 THEN d.d3 END) AS max3,
       COUNT(CASE WHEN d.d4 >= 0 THEN 1 END) AS n4, AVG(CASE WHEN d.d4 >= 0 THEN d.d4 END) AS avg4, MIN(CASE WHEN d.d4 >= 0 THEN d.d4 END) AS min4, MAX(CASE WHEN d.d4 >= 0 THEN d.d4 END) AS max4,
       COUNT(CASE WHEN d.d5 >= 0 THEN 1 END) AS n5, AVG(CASE WHEN d.d5 >= 0 THEN d.d5 END) AS avg5, MIN(CASE WHEN d.d5 >= 0 THEN d.d5 END) AS min5, MAX(CASE WHEN d.d5 >= 0 THEN d.d5 END) AS max5
     FROM (
       SELECT l.id,
         TIMESTAMPDIFF(DAY, l.created_at, COALESCE(la.t, l.assigned_at)) AS d1,
         TIMESTAMPDIFF(DAY, COALESCE(la.t, l.assigned_at), lp.t) AS d2,
         TIMESTAMPDIFF(DAY, lp.t, lc.t) AS d3,
         TIMESTAMPDIFF(DAY, lc.t, ls.t) AS d4,
         TIMESTAMPDIFF(DAY, ls.t, lo.t) AS d5
       FROM leads l
       LEFT JOIN (SELECT journey_id, MIN(created_at) AS t FROM journey_activity_logs WHERE action = 'assigned' GROUP BY journey_id) la ON la.journey_id = l.journey_id
       LEFT JOIN (SELECT journey_id, MIN(created_at) AS t FROM journey_activity_logs WHERE action = 'proposal_created' GROUP BY journey_id) lp ON lp.journey_id = l.journey_id
       LEFT JOIN (SELECT journey_id, MIN(created_at) AS t FROM journey_activity_logs WHERE action = 'proposal_status_changed' AND status_after = 'CONTRACT_SIGNED' GROUP BY journey_id) lc ON lc.journey_id = l.journey_id
       LEFT JOIN (SELECT journey_id, MIN(created_at) AS t FROM journey_activity_logs WHERE action = 'station_created' GROUP BY journey_id) ls ON ls.journey_id = l.journey_id
       LEFT JOIN (SELECT journey_id, MIN(created_at) AS t FROM journey_activity_logs WHERE action = 'station_status_changed' AND status_after = 'ACTIVE' GROUP BY journey_id) lo ON lo.journey_id = l.journey_id
       ${whereSql}
     ) d`,
    lw.params
  );
  const r = rows[0] || {};
  const round1 = (v) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);
  const num = (v) => (v === null || v === undefined ? 0 : Number(v));
  const stages = STAGE_DEFS.map((s, i) => {
    const k = i + 1;
    return {
      key: s.key, label: s.label,
      n: num(r[`n${k}`]), avg: round1(r[`avg${k}`]),
      min: r[`min${k}`] === null || r[`min${k}`] === undefined ? null : Number(r[`min${k}`]),
      max: r[`max${k}`] === null || r[`max${k}`] === undefined ? null : Number(r[`max${k}`]),
    };
  });
  const result = { stages, generated_at: new Date().toISOString() };
  ttlCache.set(cacheKey, result, CACHE_TTL_MS);
  return { ...result, cached: false };
};

const LEAD360_DEFAULT_SECTIONS = [
  { key: 'header', title: 'Thông tin chung', visible: true, order: 1 },
  { key: 'durations', title: 'Thời gian chuyển giai đoạn', visible: true, order: 2 },
  { key: 'cskh', title: 'Chăm sóc khách hàng', visible: true, order: 3 },
  { key: 'tvbh', title: 'Tư vấn bán hàng', visible: true, order: 4 },
  { key: 'proposals', title: 'Đề xuất', visible: true, order: 5 },
  { key: 'stations', title: 'Trạm', visible: true, order: 6 },
  { key: 'timeline', title: 'Dòng thời gian', visible: true, order: 7 },
];

async function datasetLead360Sections() {
  const [rows] = await pool.query('SELECT layout_json FROM report_dashboard_configs WHERE dashboard_key = ? LIMIT 1', ['lead360']);
  if (rows.length > 0) {
    try {
      const parsed = typeof rows[0].layout_json === 'string' ? JSON.parse(rows[0].layout_json) : rows[0].layout_json;
      if (parsed && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
        return { sections: parsed.sections, customized: true };
      }
    } catch { /* fallback default */ }
  }
  return { sections: LEAD360_DEFAULT_SECTIONS, customized: false };
}

exports.buildReportScope = buildReportScope;
exports.proposalScopeClause = proposalScopeClause;

const CHART_WHITELIST = ['kpi', 'bar', 'line', 'pie', 'funnel', 'table', 'echarts_bar', 'dwell'];
const SIZE_WHITELIST = ['sm', 'md', 'lg', 'full'];

function parseWidgetLayout(value) {
  if (!value || typeof value !== 'object') return null;
  const num = (v) => Number(v);
  const x = num(value.x); const y = num(value.y); const w = num(value.w); const h = num(value.h);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  return {
    x: Math.min(11, Math.max(0, Math.floor(x))),
    y: Math.min(9999, Math.max(0, Math.floor(y))),
    w: Math.min(12, Math.max(1, Math.floor(w))),
    h: Math.min(30, Math.max(1, Math.floor(h))),
  };
}

function parseWidgets(input) {
  if (!Array.isArray(input) || input.length === 0) throw badRequest('widgets phải là mảng không rỗng');
  if (input.length > 50) throw badRequest('Tối đa 50 widget');
  return input.map((w, i) => {
    if (!w || typeof w !== 'object') throw badRequest(`Widget #${i + 1} không hợp lệ`);
    const chart = w.chart === undefined || w.chart === null || w.chart === '' ? 'table' : String(w.chart);
    if (!CHART_WHITELIST.includes(chart)) throw badRequest(`Chart không hợp lệ: ${chart}`);
    const size = w.size === undefined || w.size === null || w.size === '' ? 'md' : String(w.size);
    if (!SIZE_WHITELIST.includes(size)) throw badRequest(`Size không hợp lệ: ${size}`);
    const order = Number.isFinite(Number(w.order)) ? Number(w.order) : i + 1;
    const title = w.title !== undefined && w.title !== null && String(w.title) !== '' ? String(w.title).slice(0, 120) : null;
    const id = w.id !== undefined && w.id !== null && String(w.id) !== '' ? String(w.id).slice(0, 40) : `w${i + 1}`;
    const layout = parseWidgetLayout(w.layout);

    if (w.kind === 'detail') {
      return { kind: 'detail', id, title: title || 'Bảng chi tiết Lead', chart, size, order, layout };
    }

    if (w.dataset !== undefined && w.dataset !== null && String(w.dataset) !== '') {
      const filters = Array.isArray(w.filters) ? w.filters.slice(0, 10).map((f) => ({
        key: String((f && f.key) || '').slice(0, 60),
        op: String((f && f.op) || '=').slice(0, 10),
        value: f && f.value !== undefined && f.value !== null ? String(f.value).slice(0, 100) : '',
      })) : [];
      return {
        id,
        dataset: String(w.dataset).slice(0, 40),
        dimension: String(w.dimension || '').slice(0, 60),
        metric: String(w.metric || '').slice(0, 60),
        agg: String(w.agg || 'count').slice(0, 20),
        filters,
        sort: String(w.sort || 'value_desc').slice(0, 20),
        limit: Math.min(Math.max(Number(w.limit) || 20, 1), 200),
        chart,
        size,
        title: title || '',
        order,
        layout,
      };
    }

    const metric = String(w.metric || '').trim();
    if (!METRIC_REGISTRY.includes(metric)) throw badRequest(`Metric không hợp lệ: ${metric || '(trống)'}`);
    return { metric, title: title || metric, chart, size, order, id, layout };
  }).sort((a, b) => a.order - b.order);
}

exports.CHART_WHITELIST = CHART_WHITELIST;

exports.getDashboardConfig = async (key) => {
  const dashboardKey = key ? String(key).slice(0, 50) : 'pipeline';
  const [rows] = await pool.query('SELECT dashboard_key, layout_json, updated_by, updated_at FROM report_dashboard_configs WHERE dashboard_key = ? LIMIT 1', [dashboardKey]);
  if (rows.length === 0) return { dashboard_key: dashboardKey, widgets: [], updated_by: null, updated_at: null };
  const row = rows[0];
  let layout = null;
  try {
    layout = typeof row.layout_json === 'string' ? JSON.parse(row.layout_json) : row.layout_json;
  } catch { layout = null; }
  const widgets = Array.isArray(layout) ? layout : [];
  return { dashboard_key: row.dashboard_key, widgets, layout, updated_by: row.updated_by, updated_at: row.updated_at };
};

function parseSections(input) {
  if (!Array.isArray(input) || input.length === 0) throw badRequest('sections phải là mảng không rỗng');
  const keys = new Set(exports.LEAD360_KEYS || []);
  return input.map((s, i) => {
    if (!s || typeof s !== 'object') throw badRequest(`Section #${i + 1} không hợp lệ`);
    const key = String(s.key || '').trim();
    if (!keys.has(key)) throw badRequest(`Section không hợp lệ: ${key || '(trống)'}`);
    return {
      key,
      title: s.title !== undefined && s.title !== null && String(s.title) !== '' ? String(s.title).slice(0, 120) : key,
      visible: s.visible === undefined || s.visible === null ? true : !!s.visible,
      order: Number.isFinite(Number(s.order)) ? Number(s.order) : i + 1,
    };
  }).sort((a, b) => a.order - b.order);
}

exports.updateDashboardConfig = async (key, widgets, userId, body) => {
  const dashboardKey = key ? String(key).slice(0, 50) : 'pipeline';
  if ((!widgets || (Array.isArray(widgets) && widgets.length === 0)) && body && Array.isArray(body.sections)) {
    const parsed = parseSections(body.sections);
    await pool.query(
      `INSERT INTO report_dashboard_configs (dashboard_key, layout_json, updated_by) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE layout_json = VALUES(layout_json), updated_by = VALUES(updated_by)`,
      [dashboardKey, JSON.stringify({ sections: parsed }), userId || null]
    );
    return exports.getDashboardConfig(dashboardKey);
  }
  const parsed = parseWidgets(widgets);
  await pool.query(
    `INSERT INTO report_dashboard_configs (dashboard_key, layout_json, updated_by) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE layout_json = VALUES(layout_json), updated_by = VALUES(updated_by)`,
    [dashboardKey, JSON.stringify(parsed), userId || null]
  );
  return exports.getDashboardConfig(dashboardKey);
};

function parseCustomTables(customData) {
  let cd = customData;
  try {
    if (typeof cd === 'string') cd = JSON.parse(cd);
  } catch { cd = {}; }
  if (!cd || typeof cd !== 'object') cd = {};
  const asArray = (v) => (Array.isArray(v) ? v : []);
  return {
    cskh_history: asArray(cd.cskh_history),
    cskh_note: cd.cskh_note || '',
    tvbh_history: asArray(cd.tvbh_history),
    tvbh_note: cd.tvbh_note || '',
  };
}

function dayDiff(a, b) {
  if (!a || !b) return null;
  const ms = new Date(b) - new Date(a);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round((ms / 86400000) * 10) / 10;
}

exports.getLead360 = async (leadId, user) => {
  const id = Number(leadId);
  if (!Number.isFinite(id)) throw badRequest('Lead không hợp lệ');
  const [lrows] = await pool.query(
    `SELECT l.*, j.journey_code, j.current_stage, j.status AS journey_status
     FROM leads l LEFT JOIN business_journeys j ON j.id = l.journey_id
     WHERE l.id = ? LIMIT 1`,
    [id]
  );
  if (lrows.length === 0 || lrows[0].deleted_at) {
    throw Object.assign(new Error('Không tìm thấy Lead'), { statusCode: 404 });
  }
  const lead = lrows[0];
  if (!(await leadService.canAccessLead(lead, user))) {
    throw Object.assign(new Error('Không có quyền truy cập'), { statusCode: 403 });
  }

  const [[assignee]] = await pool.query('SELECT full_name FROM users WHERE id = ? LIMIT 1', [lead.assigned_user_id || 0]);
  const tables = parseCustomTables(lead.custom_data);

  const [logs] = await pool.query(
    `SELECT id, action, status_after, actor_id, actor_role, source, created_at
     FROM journey_activity_logs WHERE journey_id = ? ORDER BY created_at ASC, id ASC`,
    [lead.journey_id]
  );
  const first = (pred) => {
    const l = logs.find(pred);
    return l ? l.created_at : null;
  };
  const tCreated = first((l) => l.action === 'lead_created') || lead.created_at;
  const tAssigned = first((l) => l.action === 'assigned') || lead.assigned_at;
  const tProposed = first((l) => l.action === 'proposal_created');
  const tContract = first((l) => l.action === 'proposal_status_changed' && l.status_after === 'CONTRACT_SIGNED');
  const tStation = first((l) => l.action === 'station_created');
  const tOn = first((l) => l.action === 'station_status_changed' && l.status_after === 'ACTIVE');

  const timeline = logs.map((l) => ({
    id: l.id,
    entity_type: 'lead',
    entity_id: lead.id,
    action: l.action,
    stage_before: null,
    stage_after: null,
    status_before: null,
    status_after: l.status_after,
    actor_id: l.actor_id,
    actor_role: l.actor_role,
    source: l.source,
    created_at: l.created_at,
  }));

  const proposals = await leadService.getJourneyProposals(lead.journey_id);
  const proposalBlocks = proposals.map((p) => ({
    id: p.id,
    code: p.ma_de_xuat,
    status: p.status,
    created_at: p.created_at,
    station: p.station_id_resolved ? {
      id: p.station_id_resolved,
      name: p.station_name,
      status: p.station_status,
      code: p.station_code,
    } : null,
  }));

  const stationBlocks = [];
  proposalBlocks.forEach((p) => {
    if (!p.station) return;
    stationBlocks.push({
      ...p.station,
      proposal_code: p.code,
    });
  });

  return {
    header: {
      id: lead.id,
      lead_code: lead.lead_code,
      journey_code: lead.journey_code,
      full_name: lead.full_name,
      phone: lead.phone,
      email: lead.email,
      province: lead.province,
      region: lead.region,
      stage: lead.stage,
      current_stage: lead.current_stage,
      customer_classification: lead.customer_classification,
      sales_outcome: lead.sales_outcome,
      assigned_user_id: lead.assigned_user_id,
      assigned_user_name: assignee && assignee.full_name ? assignee.full_name : null,
      assigned_department: lead.assigned_department,
      created_at: lead.created_at,
    },
    durations: {
      new_to_assigned_days: dayDiff(tCreated, tAssigned),
      assigned_to_proposal_days: dayDiff(tAssigned, tProposed),
      proposal_to_contract_days: dayDiff(tProposed, tContract),
      contract_to_station_days: dayDiff(tContract, tStation),
      station_to_on_days: dayDiff(tStation, tOn),
    },
    cskh: { count: tables.cskh_history.length, history: tables.cskh_history, note: tables.cskh_note },
    tvbh: { count: tables.tvbh_history.length, history: tables.tvbh_history, note: tables.tvbh_note },
    proposals: proposalBlocks,
    stations: stationBlocks,
    timeline,
    counts: {
      proposals: proposalBlocks.length,
      stations: stationBlocks.length,
      on: lead.current_stage === 'ON',
    },
    generated_at: new Date().toISOString(),
  };
};

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  rows.forEach((r) => lines.push(headers.map((h) => csvCell(r[h])).join(',')));
  return '\uFEFF' + lines.join('\r\n');
}

exports.lead360Csv = async (leadId, user) => {
  const d = await exports.getLead360(leadId, user);
  const headers = [
    'lead_code', 'full_name', 'phone', 'province', 'region', 'stage', 'current_stage',
    'customer_classification', 'sales_outcome', 'assigned_user_name', 'assigned_department',
    'duration_new_to_assigned_days', 'duration_assigned_to_proposal_days', 'duration_proposal_to_contract_days',
    'duration_contract_to_station_days', 'duration_station_to_on_days',
    'cskh_count', 'tvbh_count',
    'proposal_code', 'proposal_status', 'station_name', 'station_status', 'on',
  ];
  const base = {
    lead_code: d.header.lead_code,
    full_name: d.header.full_name,
    phone: d.header.phone,
    province: d.header.province,
    region: d.header.region,
    stage: d.header.stage,
    current_stage: d.header.current_stage,
    customer_classification: d.header.customer_classification,
    sales_outcome: d.header.sales_outcome,
    assigned_user_name: d.header.assigned_user_name,
    assigned_department: d.header.assigned_department,
    duration_new_to_assigned_days: d.durations.new_to_assigned_days,
    duration_assigned_to_proposal_days: d.durations.assigned_to_proposal_days,
    duration_proposal_to_contract_days: d.durations.proposal_to_contract_days,
    duration_contract_to_station_days: d.durations.contract_to_station_days,
    duration_station_to_on_days: d.durations.station_to_on_days,
    cskh_count: d.cskh.count,
    tvbh_count: d.tvbh.count,
    on: d.counts.on ? 'YES' : 'NO',
  };
  const rows = d.proposals.length === 0 ? [{ ...base }] : d.proposals.map((p) => ({
    ...base,
    proposal_code: p.code,
    proposal_status: p.status,
    station_name: p.station ? p.station.name : '',
    station_status: p.station ? p.station.status : '',
  }));
  return { filename: `lead360_${d.header.lead_code || leadId}.csv`, csv: toCsv(headers, rows) };
};

exports.builderCsv = async (widget, user) => {
  const reportBuilderService = require('./reportBuilderService');
  const out = await reportBuilderService.compileWidget(widget, user);
  const csv = toCsv(['dim', 'value'], out.rows);
  const name = (out.widget.title || `${out.widget.metric}_theo_${out.widget.dimension}`).replace(/[^\w\-]+/g, '_').slice(0, 60);
  return { filename: `${name}.csv`, csv };
};

exports.leadWhereClause = leadWhere;
exports.proposalWhereClause = proposalWhere;
exports.stationWhereClause = stationWhere;
exports.SIZE_WHITELIST = SIZE_WHITELIST;
exports.LEAD360_KEYS = LEAD360_DEFAULT_SECTIONS.map((s) => s.key);
exports.LEAD360_DEFAULT_SECTIONS = LEAD360_DEFAULT_SECTIONS;
