const pool = require('../utils/db');
const apiConfigService = require('./apiConfigService');
const workAutomationService = require('./workAutomationService');
const googleSheetService = require('./googleSheetService');
const dynamicUtils = require('./dynamicUtils');
const formService = require('./formService');
const reportMirrorService = require('./reportMirrorService');

const FIELD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const versionOfCache = new Map();
let userMapCache = { at: 0, map: {} };
const proposalCache = new Map();
const PROPOSAL_CACHE_TTL_MS = 10 * 60 * 1000;

const ACTION_NODE_TYPES = new Set(['taskaction', 'tasksign']);
const CONTACT_NODE_ID = 'contact';
const CONTACT_SKIP_TYPES = new Set(['password']);

const GENERIC_ACTION_TITLES = new Set(['chấm điểm và đánh giá', 'duyệt', 'không duyệt', 'xác nhận', 'thỏa mãn', 'không thỏa mãn']);
const GENERIC_FORM_TITLES = new Set(['điểm số', 'đánh giá chi tiết', 'ghi chú', 'lý do', 'phòng ban', 'nội dung']);
const ROLE_PREFIXES = ['admin', 'gđkv', 'gđttkd', 'gdttkd', 'p.tckt', 'tgđ', 'tgdkd', 'gđtt', 'chủ tịch'];
const VERDICT_KEYWORD_RE = /bcđx|đề xuất|hồ sơ|chủ trương|layout|nghiệm thu/i;

const nodeCenter = (n) => ({
  x: (Number(n.x) || 0) + (Number(n.w) || 0) / 2,
  y: (Number(n.y) || 0) + (Number(n.h) || 0) / 2,
});

const stripRolePrefix = (s) => {
  let t = String(s || '').trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of ROLE_PREFIXES) {
      const re = new RegExp(`^${r.replace('.', '\\.')}\\s+`, 'i');
      if (re.test(t)) { t = t.replace(re, '').trim(); changed = true; }
    }
  }
  return t;
};

const cleanContextName = (s) => String(s || '').replace(/\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim();

const computeActionContext = (node, tasks) => {
  const title = cleanContextName(node.title);
  if (!title) return '';
  if (!GENERIC_ACTION_TITLES.has(title.toLowerCase())) return title;
  if (!Array.isArray(tasks) || tasks.length === 0) return title;
  if (![node.x, node.y, node.w, node.h].some((v) => Number.isFinite(Number(v)))) return title;
  const c = nodeCenter(node);
  let best = null;
  let bestD = Infinity;
  for (const t of tasks) {
    const tc = nodeCenter(t);
    const d = Math.abs(c.x - tc.x) + Math.abs(c.y - tc.y);
    if (d < bestD) { bestD = d; best = t; }
  }
  if (!best) return title;
  const tTitle = cleanContextName(best.title);
  const low = title.toLowerCase();
  if (['duyệt', 'không duyệt', 'thỏa mãn', 'không thỏa mãn'].includes(low)) {
    let obj = stripRolePrefix(tTitle).replace(/^(phê\s+)?duyệt\s+/i, '').replace(/\s+duyệt$/i, '').trim();
    if (obj && VERDICT_KEYWORD_RE.test(obj) && obj.split(/\s+/).length <= 5) return `${title} ${obj}`;
    return title;
  }
  return tTitle || title;
};

const actionFieldLabel = (node, rest, fieldTitle) => {
  const ctx = String(node.context || node.title || '').trim();
  if (rest === 'status') return ctx ? `Trạng thái ${ctx}` : 'Trạng thái';
  if (rest === 'end_plan') return ctx ? `Deadline ${ctx} dự kiến` : 'Deadline dự kiến';
  if (rest === 'end_real') return ctx ? `Deadline ${ctx} thực tế` : 'Deadline thực tế';
  if (rest.startsWith('form.')) {
    const ft = String(fieldTitle || '').trim();
    if (!ft) return ctx || 'Trường';
    return GENERIC_FORM_TITLES.has(ft.toLowerCase()) && ctx ? `${ft} ${ctx}` : ft;
  }
  return fieldTitle || rest;
};

const stripHtml = (s) => String(s == null ? '' : s)
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|ul|ol)>/gi, '\n')
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

const cleanVal = (v) => {
  const s = stripHtml(v);
  if (/^\{[^}]*\}$/.test(s)) return '';
  return s;
};

const getWorkToken = async (automationKeyOrAuto) => {
  if (automationKeyOrAuto) {
    if (typeof automationKeyOrAuto === 'object' && automationKeyOrAuto.api_token_enc) {
      return workAutomationService.decryptSecret(automationKeyOrAuto.api_token_enc);
    }
    const auto = await workAutomationService.getByKey(automationKeyOrAuto);
    if (auto && auto.api_token_enc) return workAutomationService.decryptSecret(auto.api_token_enc);
  }
  const syncAuto = await workAutomationService.getFirstByType('sync_sheet');
  if (syncAuto && syncAuto.api_token_enc) return workAutomationService.decryptSecret(syncAuto.api_token_enc);
  const fallback = await workAutomationService.getFirstByType('assign_process');
  if (fallback && fallback.api_token_enc) return workAutomationService.decryptSecret(fallback.api_token_enc);
  throw Object.assign(new Error('Thieu work API token (nhap o tab Automation)'), { statusCode: 400 });
};

const webBaseUrl = async () => {
  try {
    const cfg = await apiConfigService.getDefaultPushConfig();
    if (cfg && cfg.base_url) return String(cfg.base_url).replace(/\/$/, '');
  } catch { /* silent */ }
  return 'https://egr.1office.vn';
};

const apiGet = async (token, path, { timeoutMs = 30000, retries = 2 } = {}) => {
  const base = await webBaseUrl();
  let lastErr = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(`${base}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(timeoutMs) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j || j.error !== false) throw new Error('1Office tra loi: ' + JSON.stringify(j).slice(0, 200));
      return j;
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((x) => setTimeout(x, 2000 * (i + 1)));
    }
  }
  if (lastErr && (lastErr.name === 'TimeoutError' || /aborted|timeout/i.test(lastErr.message || ''))) {
    throw Object.assign(new Error('1Office phan hoi cham (qua 30s), thu lai sau'), { statusCode: 504 });
  }
  throw lastErr;
};

const sessionDialog = async (auto, processId) => {
  const { fetchDialogValues } = require('./workAutomationDialog');
  return fetchDialogValues(auto, processId);
};

exports.getSyncAutomation = async (key) => {
  if (key) return workAutomationService.getByKey(key);
  return workAutomationService.getFirstByType('sync_sheet');
};

exports.listTemplateProcesses = async (auto) => {
  const token = auto && auto.api_token_enc ? workAutomationService.decryptSecret(auto.api_token_enc) : await getWorkToken();
  let page = 1;
  const all = [];
  for (;;) {
    const j = await apiGet(token, `/api/work/process/gets?limit=100&page=${page}`);
    const rows = Array.isArray(j.data) ? j.data : [];
    all.push(...rows);
    if (all.length >= (j.total_item || 0) || rows.length === 0 || page > 20) break;
    page++;
  }
  const templateMap = new Map();
  for (const d of all) {
    const typeName = d.process_type_id;
    if (!typeName) continue;
    if (!templateMap.has(typeName)) {
      templateMap.set(typeName, { ID: typeName, title: typeName, count: 0, sample_process_id: d.ID });
    }
    templateMap.get(typeName).count++;
  }
  return [...templateMap.values()].sort((a, b) => b.count - a.count);
};

const parseTemplateIds = (auto) => {
  if (!auto || !auto.template_process_ids) return [];
  try {
    const v = typeof auto.template_process_ids === 'string' ? JSON.parse(auto.template_process_ids) : auto.template_process_ids;
    return (Array.isArray(v) ? v : []).map((x) => String(x)).filter(Boolean);
  } catch { return []; }
};
exports.parseTemplateIds = parseTemplateIds;

exports.getTemplateProcessVersions = async (templateNames) => {
  const nameArr = (templateNames || []).map(String).filter(Boolean);
  if (nameArr.length === 0) return {};
  const placeholders = nameArr.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT version,
      JSON_UNQUOTE(JSON_EXTRACT(tree_json, '$.template')) AS template,
      JSON_UNQUOTE(JSON_EXTRACT(tree_json, '$.template_id')) AS template_id
     FROM automation_field_cache
     WHERE JSON_UNQUOTE(JSON_EXTRACT(tree_json, '$.template')) IN (${placeholders})
        OR JSON_UNQUOTE(JSON_EXTRACT(tree_json, '$.template_id')) IN (${placeholders})
     ORDER BY version ASC`,
    [...nameArr, ...nameArr]
  );
  const results = {};
  for (const name of nameArr) results[name] = [];
  for (const r of rows) {
    for (const name of nameArr) {
      if (String(r.template) === name || String(r.template_id) === name) {
        if (!results[name].includes(r.version)) results[name].push(r.version);
      }
    }
  }
  return results;
};

const allowedVersionsForAuto = async (auto) => {
  const ids = parseTemplateIds(auto);
  if (ids.length === 0) return null;
  const [rows] = await pool.query(
    `SELECT version,
      JSON_UNQUOTE(JSON_EXTRACT(tree_json, '$.template')) AS template,
      JSON_UNQUOTE(JSON_EXTRACT(tree_json, '$.template_id')) AS template_id
     FROM automation_field_cache`
  );
  const idSet = new Set(ids.map(String));
  return rows
    .filter((r) => idSet.has(String(r.template)) || idSet.has(String(r.template_id)))
    .map((r) => String(r.version));
};
exports.allowedVersionsForAuto = allowedVersionsForAuto;

exports.listRoots = async (auto) => {
  const token = await getWorkToken(auto);
  let page = 1;
  const all = [];
  for (;;) {
    const j = await apiGet(token, `/api/work/process/gets?limit=100&page=${page}`);
    const rows = Array.isArray(j.data) ? j.data : [];
    all.push(...rows);
    if (all.length >= (j.total_item || 0) || rows.length === 0 || page > 10) break;
    page++;
  }
  return all.filter((d) => !d.parent_id && String(d.method || '').includes('Quy tr')).map((d) => ({ ID: d.ID, title: d.title, process_type_id: d.process_type_id || '' }));
};

exports.versionOf = async (auto, processId) => {
  if (versionOfCache.has(processId)) return versionOfCache.get(processId);
  const vals = await sessionDialog(auto, processId);
  const v = String(vals.workflow_version_id);
  versionOfCache.set(processId, v);
  return v;
};

const slimNode = (n) => {
  const d = n.data || {};
  const o = { id: n.id, type: n.type, title: d.title || '' };
  o.x = n.x; o.y = n.y; o.w = n.w; o.h = n.h;
  o.user_ids = d.user_ids; o.users = d.users; o.userId = d.userId;
  o.period = d.period; o.period_time = d.period_time; o.desc = d.desc;
  o.start_plan = d.start_plan; o.end_plan = d.end_plan;
  o.method = d.method; o.url = d.url; o.content = d.content;
  o.object = d.object; o.event = d.event; o.filter = typeof d.filter === 'string' ? d.filter.slice(0, 300) : d.filter;
  o.body_fields = Array.isArray(d.body_fields) ? d.body_fields.map((x) => ({ name: x.name })) : d.body_fields;
  o.inputs = Array.isArray(d.inputs) ? d.inputs.map((x) => ({ id: x.id, name: x.name })) : d.inputs;
  o.dataSigners = Array.isArray(d.dataSigners) ? d.dataSigners.map((s) => s.title) : d.dataSigners;
  const fb = d.formbuilder;
  if (fb && fb.form_config) o.form = { name: (fb.form_config.form_name || {}).val || '', fields: (fb.fields || []).map((f) => ({ keyword: f.keyword, title: f.title, type: f.type, required: f.required })) };
  else if (Array.isArray(fb)) o.form = fb;
  return o;
};

const buildTree = (nodes) => nodes.filter((n) => n.type !== 'connector').map((n) => {
  const s = slimNode(n);
  const fields = [
    { path: `node.${s.id}.node_id`, label: 'Mã node' },
    { path: `node.${s.id}.type`, label: 'Loại node' },
    { path: `node.${s.id}.title`, label: 'Tên node' },
    { path: `node.${s.id}.status`, label: 'Trạng thái (suy ra: đúng/quá hạn, nhánh)' },
  ];
  const pushUser = (raw, base) => {
    if (raw === undefined || raw === null) return;
    fields.push({ path: `node.${s.id}.${base}`, label: `${base} (key gốc)` });
    fields.push({ path: `node.${s.id}.${base === 'users' || base === 'userId' ? 'user_name' : 'user_name'}`, label: 'Tên người thực hiện (suy ra)', from: base });
  };
  if (s.user_ids !== undefined) { fields.push({ path: `node.${s.id}.user_ids`, label: 'Người thực hiện (key gốc)' }); fields.push({ path: `node.${s.id}.user_name`, label: 'Tên người thực hiện (suy ra)', from: 'user_ids' }); }
  if (s.users !== undefined) { fields.push({ path: `node.${s.id}.users`, label: 'Người nhận (key gốc)' }); fields.push({ path: `node.${s.id}.user_name`, label: 'Tên người nhận (suy ra)', from: 'users' }); }  if (s.userId !== undefined) { fields.push({ path: `node.${s.id}.userId`, label: 'Người ký (key gốc)' }); fields.push({ path: `node.${s.id}.user_name`, label: 'Tên người ký (suy ra)', from: 'userId' }); }
  if (s.form && s.form.fields) {
    for (const f of s.form.fields) fields.push({ path: `node.${s.id}.form.${f.keyword}`, label: `${f.title} (${f.type})` });
  }
  if (s.period) fields.push({ path: `node.${s.id}.period`, label: 'Thời hạn' });
  if (s.desc) fields.push({ path: `node.${s.id}.desc`, label: 'Mô tả node' });
  if (Array.isArray(s.inputs)) s.inputs.forEach((x, i) => fields.push({ path: `node.${s.id}.condition.${i}`, label: `Nhánh: ${x.name}` }));
  if (s.content) fields.push({ path: `node.${s.id}.content`, label: 'Nội dung thông báo' });
  if (s.method || s.url) { fields.push({ path: `node.${s.id}.method`, label: 'HTTP method' }); fields.push({ path: `node.${s.id}.url`, label: 'HTTP URL' }); }
  if (s.object || s.event) { fields.push({ path: `node.${s.id}.object`, label: 'Đối tượng sự kiện' }); fields.push({ path: `node.${s.id}.event`, label: 'Tên sự kiện' }); }
  if (Array.isArray(s.dataSigners)) fields.push({ path: `node.${s.id}.signers`, label: 'Người ký' });
  if (ACTION_NODE_TYPES.has(s.type)) {
    fields.push({ path: `node.${s.id}.end_plan`, label: 'Thời gian kết thúc dự kiến' });
    fields.push({ path: `node.${s.id}.end_real`, label: 'Thời gian kết thúc thực tế (suy từ lịch sử)' });
  }
  return { id: s.id, type: s.type, title: s.title, x: s.x, y: s.y, w: s.w, h: s.h, fields, raw: s };
});

const withActionContexts = (nodes) => {
  const tasks = nodes.filter((n) => n && n.type === 'task');
  for (const n of nodes) {
    if (n && ACTION_NODE_TYPES.has(n.type)) n.context = computeActionContext(n, tasks);
  }
  return nodes;
};

const parseJsonSafe = (v) => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
};

const parseFormFieldConfig = (f) => {
  const cfg = f && f.config ? parseJsonSafe(f.config) : null;
  return cfg && typeof cfg === 'object' ? cfg : {};
};

const buildContactGroups = (form, fields) => {
  const layout = form ? parseJsonSafe(form.layout_config) : null;
  const sections = layout && Array.isArray(layout.sections) ? layout.sections.filter(Boolean) : [];
  const sectionMap = {};
  sections.forEach((s) => { if (s && s.id) sectionMap[s.id] = s; });
  const referenced = new Set();
  sections.forEach((s) => {
    if (s && (s.type === 'tabs' || Array.isArray(s.tabs))) {
      (s.tabs || []).forEach((t) => (t && Array.isArray(t.sectionRefs) ? t.sectionRefs : []).forEach((r) => referenced.add(r)));
    }
  });
  const fieldsOfSection = (sec) => {
    if (!sec || !Array.isArray(sec.rows)) return [];
    const rowIds = sec.rows.map((r) => r && r.id).filter(Boolean);
    return fields
      .filter((f) => rowIds.includes(f.rowId))
      .sort((a, b) => (a.rowIndex || 0) - (b.rowIndex || 0) || (a.colIndex || 0) - (b.colIndex || 0));
  };
  const out = [];
  const seen = new Set();
  const pushSection = (sec, groupPath) => {
    fieldsOfSection(sec).forEach((f) => {
      if (!f.key || seen.has(f.key) || CONTACT_SKIP_TYPES.has(f.type)) return;
      seen.add(f.key);
      out.push({ key: f.key, label: f.label, group: groupPath });
    });
  };
  sections.forEach((sec) => {
    if (!sec || !sec.id) return;
    if (sec.type === 'tabs' || Array.isArray(sec.tabs)) {
      (sec.tabs || []).forEach((tab) => {
        if (!tab) return;
        (Array.isArray(tab.sectionRefs) ? tab.sectionRefs : []).forEach((refId) => {
          const ref = sectionMap[refId];
          if (ref) pushSection(ref, [sec.title || sec.id, tab.title || tab.id]);
        });
      });
    } else {
      if (referenced.has(sec.id)) return;
      pushSection(sec, [sec.title || sec.id]);
    }
  });
  const leftover = fields.filter((f) => f.key && !seen.has(f.key) && !CONTACT_SKIP_TYPES.has(f.type));
  if (leftover.length > 0) {
    leftover.forEach((f) => {
      if (seen.has(f.key)) return;
      seen.add(f.key);
      out.push({ key: f.key, label: f.label, group: ['Khác'] });
    });
  }
  return out;
};

const buildContactNode = async () => {
  const node = {
    id: CONTACT_NODE_ID,
    type: CONTACT_NODE_ID,
    title: 'Liên hệ gắn với quy trình',
    fields: [],
  };
  try {
    const form = await formService.getFormByEntityAndPurpose('station_proposals', 'view');
    if (!form) return node;
    const full = await formService.getFormById(form.id);
    const rawFields = full && Array.isArray(full.fields) ? full.fields : [];
    const fields = rawFields
      .map((f) => {
        const cfg = parseFormFieldConfig(f);
        return {
          key: f.key || f.field_key,
          label: f.label || f.field_label || f.key || f.field_key,
          type: f.type || f.field_type || 'text',
          rowId: cfg.rowId,
          rowIndex: cfg.rowIndex,
          colIndex: cfg.colIndex,
        };
      })
      .filter((f) => f.key);
    const grouped = buildContactGroups(form, fields);
    node.fields = grouped.map((f) => ({
      path: `${CONTACT_NODE_ID}.${f.key}`,
      label: f.label,
      group: f.group,
    }));
    const virtual = [
      { key: '__tru_tdt', label: 'Số lượng trụ TDT' },
      { key: '__tru_nq', label: 'Số lượng trụ NQ' },
      { key: '__tru_lk', label: 'Số lượng trụ LK' },
      { key: '__tru_total', label: 'Tổng số lượng trụ' },
    ];
    const existing = new Set(node.fields.map((f) => f.path));
    for (const v of virtual) {
      const path = `${CONTACT_NODE_ID}.${v.key}`;
      if (existing.has(path)) continue;
      node.fields.push({ path, label: v.label, group: ['Số lượng trụ'] });
    }
  } catch (e) {
    console.warn('[syncReport] build contact node loi:', e.message);
  }
  return node;
};

const ensureVirtualFields = async (tree) => {
  if (!tree || !Array.isArray(tree.nodes)) return tree;
  const taskNodes = tree.nodes.filter((n) => n && n.type === 'task');
  for (const n of tree.nodes) {
    if (!n || !ACTION_NODE_TYPES.has(n.type)) continue;
    n.context = computeActionContext(n, taskNodes);
    if (!Array.isArray(n.fields)) continue;
    const paths = new Set(n.fields.map((f) => f.path));
    if (!paths.has(`node.${n.id}.end_plan`)) n.fields.push({ path: `node.${n.id}.end_plan`, label: 'Thời gian kết thúc dự kiến' });
    if (!paths.has(`node.${n.id}.end_real`)) n.fields.push({ path: `node.${n.id}.end_real`, label: 'Thời gian kết thúc thực tế (suy từ lịch sử)' });
    for (const f of n.fields) {
      if (!f || typeof f.path !== 'string' || !f.path.startsWith(`node.${n.id}.`)) continue;
      const rest = f.path.slice(`node.${n.id}.`.length);
      if (rest === 'status') { f.label = actionFieldLabel(n, 'status'); continue; }
      if (rest === 'end_plan') { f.label = actionFieldLabel(n, 'end_plan'); continue; }
      if (rest === 'end_real') { f.label = actionFieldLabel(n, 'end_real'); continue; }
      if (rest.startsWith('form.')) {
        const fieldTitle = String(f.label || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
        f.label = actionFieldLabel(n, rest, fieldTitle);
      }
    }
  }
  const contactNode = await buildContactNode();
  const idx = tree.nodes.findIndex((n) => n && (n.id === CONTACT_NODE_ID || n.type === CONTACT_NODE_ID));
  if (idx >= 0) tree.nodes[idx] = contactNode;
  else tree.nodes.unshift(contactNode);
  return tree;
};

exports.refreshFieldTrees = async (targetAuto, templateNames) => {
  let auto = targetAuto || await exports.getSyncAutomation();
  if (!auto) throw Object.assign(new Error('Khong tim thay automation sync'), { statusCode: 404 });
  if (!auto.username || !auto.password_enc) {
    const main = await workAutomationService.getFirstByType('assign_process');
    if (main && main.username && main.password_enc) auto = { ...auto, username: main.username, password_enc: main.password_enc };
  }
  if (!auto.username || !auto.password_enc) throw Object.assign(new Error('Chua cau hinh tai khoan 1Office (nhap o automation gan du an hoac dong bo)'), { statusCode: 400 });
  const effectiveTemplates = (templateNames && templateNames.length > 0 ? templateNames : parseTemplateIds(targetAuto || auto)).map(String).filter(Boolean);
  let roots = await exports.listRoots(auto);
  const pidToType = new Map(roots.map((r) => [String(r.ID), String(r.process_type_id || '')]));
  if (effectiveTemplates.length > 0) {
    const nameSet = new Set(effectiveTemplates);
    roots = roots.filter((r) => nameSet.has(String(r.process_type_id)));
  }

  const [cached] = await pool.query('SELECT version, tree_json FROM automation_field_cache');
  const processVersionMap = new Map();
  const knownVersions = new Set();
  for (const row of cached) {
    const tree = typeof row.tree_json === 'string' ? JSON.parse(row.tree_json) : row.tree_json;
    knownVersions.add(String(row.version));
    for (const pid of (tree.process_ids || [])) processVersionMap.set(String(pid), String(row.version));
  }

  const byVersion = {};
  let skipped = 0;
  for (const r of roots) {
    const cachedVersion = processVersionMap.get(String(r.ID));
    if (cachedVersion) {
      if (!byVersion[cachedVersion]) byVersion[cachedVersion] = [];
      byVersion[cachedVersion].push(r.ID);
      skipped++;
      continue;
    }
    try {
      const v = await exports.versionOf(auto, r.ID);
      if (!byVersion[v]) byVersion[v] = [];
      byVersion[v].push(r.ID);
    } catch { /* silent */ }
    await new Promise((x) => setTimeout(x, 300));
  }

  const newVersions = Object.keys(byVersion).filter((v) => !knownVersions.has(v));
  const out = [];
  for (const v of newVersions) {
    const ids = byVersion[v];
    try {
      const { values, nodes } = await require('./workAutomationDialog').fetchTaskprocess(auto, ids[0]);
      const tree = withActionContexts(buildTree(nodes));
      const templateTitle = values.process_type_title || '';
      const templateId = pidToType.get(String(ids[0])) || '';
      await pool.query(
        `INSERT INTO automation_field_cache (version, tree_json, fetched_at) VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE tree_json = VALUES(tree_json), fetched_at = NOW()`,
        [v, JSON.stringify({ version: v, template: templateTitle, template_id: templateId, sample_process_id: ids[0], process_ids: ids, nodes: tree })]
      );
      out.push({ version: v, template: templateTitle, template_id: templateId, processes: ids.length, nodes: tree.length });
    } catch { /* silent */ }
  }

  const existingOut = [];
  for (const v of Object.keys(byVersion)) {
    if (knownVersions.has(v) && !newVersions.includes(v)) {
      const [row] = await pool.query('SELECT tree_json FROM automation_field_cache WHERE version = ?', [v]);
      if (row.length) {
        const tree = typeof row[0].tree_json === 'string' ? JSON.parse(row[0].tree_json) : row[0].tree_json;
        existingOut.push({ version: v, template: tree.template || '', template_id: tree.template_id || '', processes: byVersion[v].length, nodes: (tree.nodes || []).length });
      }
    }
  }

  return [...existingOut, ...out];
};

exports.rebuildFieldTree = async (version) => {
  const [rows] = await pool.query('SELECT tree_json FROM automation_field_cache WHERE version = ?', [String(version)]);
  if (!rows.length) return null;
  const t = typeof rows[0].tree_json === 'string' ? JSON.parse(rows[0].tree_json) : rows[0].tree_json;
  const ids = t.process_ids || [];
  if (!ids.length) return null;
  let auto = await exports.getSyncAutomation();
  if (!auto || !auto.username || !auto.password_enc) {
    const main = await workAutomationService.getFirstByType('assign_process');
    if (main && main.username && main.password_enc) auto = { ...(auto || {}), username: main.username, password_enc: main.password_enc };
  }
  if (!auto || !auto.username || !auto.password_enc) throw Object.assign(new Error('Chua cau hinh tai khoan 1Office'), { statusCode: 400 });
  const { nodes } = await require('./workAutomationDialog').fetchTaskprocess(auto, ids[0]);
  const tree = withActionContexts(buildTree(nodes));
  await pool.query(
    'UPDATE automation_field_cache SET tree_json = ?, fetched_at = NOW() WHERE version = ?',
    [JSON.stringify({ ...t, nodes: tree, sample_process_id: ids[0] }), String(version)]
  );
  return tree;
};

exports.getFieldTree = async (version, { refresh = false } = {}) => {
  if (refresh) {
    try { await exports.rebuildFieldTree(version); } catch (e) { console.warn('[syncReport] rebuild tree loi:', e.message); }
  }
  const [rows] = await pool.query('SELECT tree_json, fetched_at FROM automation_field_cache WHERE version = ?', [String(version)]);
  if (!rows.length) {
    await exports.refreshFieldTrees();
    const [r2] = await pool.query('SELECT tree_json, fetched_at FROM automation_field_cache WHERE version = ?', [String(version)]);
    if (!r2.length) throw Object.assign(new Error(`Khong tim thay cay field version ${version} (hay nhan Get)`), { statusCode: 404 });
    const t = typeof r2[0].tree_json === 'string' ? JSON.parse(r2[0].tree_json) : r2[0].tree_json;
    return { ...(await ensureVirtualFields(t)), cached_at: r2[0].fetched_at, stale: true };
  }
  const t = typeof rows[0].tree_json === 'string' ? JSON.parse(rows[0].tree_json) : rows[0].tree_json;
  const stale = Date.now() - new Date(rows[0].fetched_at).getTime() > FIELD_CACHE_TTL_MS;
  return { ...(await ensureVirtualFields(t)), cached_at: rows[0].fetched_at, stale };
};

exports.getUserMap = async () => {
  if (Date.now() - userMapCache.at < FIELD_CACHE_TTL_MS && Object.keys(userMapCache.map).length > 0) return userMapCache.map;
  const base = await webBaseUrl();
  const tokens = [];
  try {
    const [cfgs] = await pool.query(`SELECT auth_config FROM api_configs WHERE is_active = 1`);
    for (const c of cfgs) {
      try {
        const a = typeof c.auth_config === 'string' ? JSON.parse(c.auth_config) : c.auth_config;
        for (const k of ['admin_token', 'token', 'access_token']) {
          if (a && a[k]) tokens.push(a[k]);
        }
      } catch { /* silent */ }
    }
  } catch { /* silent */ }
  try {
    const auto = await workAutomationService.getFirstByType('sync_sheet');
    if (auto && auto.api_token_enc) tokens.unshift(workAutomationService.decryptSecret(auto.api_token_enc));
  } catch { /* silent */ }
  const map = {};
  for (const tok of [...new Set(tokens)]) {
    try {
      for (const page of [1, 2]) {
        const r = await fetch(`${base}/api/admin/user/gets?access_token=${encodeURIComponent(tok)}&limit=100&page=${page}`, { signal: AbortSignal.timeout(30000) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j || j.error !== false) break;
        const users = Array.isArray(j.data) ? j.data : ((j.data && (j.data.users || j.data.data)) || []);
        if (users.length === 0) break;
        for (const u of users) map[String(u.ID ?? u.id)] = u.fullname || u.name || u.username;
        if (Object.keys(map).length >= (j.total_item || 0)) break;
      }
      if (Object.keys(map).length > 0) break;
    } catch { /* thu token tiep theo */ }
  }
  userMapCache = { at: Date.now(), map };
  return map;
};

const toList = (v) => (Array.isArray(v) ? v : (v === undefined || v === null ? [] : [v]));

const parseRealDate = (raw) => {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  let d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(.*)$/);
    if (m) d = new Date(`${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}${m[4] || ''}`);
  }
  return Number.isNaN(d.getTime()) ? null : d;
};

const parsePlanDate = (raw) => {
  const d = parseRealDate(raw);
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim())) d.setHours(23, 59, 59, 999);
  return d;
};

const deriveNodeStatus = ({ rawStatus, endPlanRaw, endRealRaw, isOverdue, now = new Date() } = {}) => {
  const st = String(rawStatus || '').trim().toLowerCase();
  if (st === 'failed') return 'Thất bại';
  if (st === 'skipped') return 'Không cần thực hiện';
  if (st === 'completed') {
    const plan = parsePlanDate(endPlanRaw);
    const real = parseRealDate(endRealRaw);
    if (plan && real) return real.getTime() <= plan.getTime() ? 'Hoàn thành đúng hạn' : 'Hoàn thành quá hạn';
    if (isOverdue === true) return 'Hoàn thành quá hạn';
    if (isOverdue === false) return 'Hoàn thành đúng hạn';
    return 'Hoàn thành';
  }
  const plan = parsePlanDate(endPlanRaw);
  if (plan && now.getTime() > plan.getTime()) return 'Quá hạn chưa hoàn thành';
  if (isOverdue === true) return 'Quá hạn chưa hoàn thành';
  return 'Đang chờ thực hiện';
};
exports.deriveNodeStatus = deriveNodeStatus;

const formatContactVal = (v) => {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) {
    return v.map((x) => {
      if (x === undefined || x === null) return '';
      if (typeof x === 'object') return String(x.original_name || x.label || x.name || x.phone || x.email || x.value || x.title || x.code || '').trim();
      return String(x).trim();
    }).filter(Boolean).join(', ');
  }
  if (typeof v === 'object') return cleanVal(v.original_name || v.label || v.name || v.value || v.title || v.code || '');
  return cleanVal(v);
};

const sumTableQty = (arr) => {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((s, r) => s + (Number(r && r.so_luong) || 0), 0);
};

const contactTruCount = (contact, key) => {
  const tdt = sumTableQty(contact.tdt_tru);
  const nq = sumTableQty(contact.nq_tru) + sumTableQty(contact.loai_tru_nq) + sumTableQty(contact.loai_tru_nq_cs);
  const lk = sumTableQty(contact.lk_tru) + sumTableQty(contact.loai_tru_lk);
  if (key === '__tru_tdt') return tdt;
  if (key === '__tru_nq') return nq;
  if (key === '__tru_lk') return lk;
  if (key === '__tru_total') return tdt + nq + lk;
  return '';
};

exports.resolveRow = async (proc, mappings, userMap) => {
  const { item, filled, tree, nodeStatus = {}, nodeFinished = {}, nodeSchedule = {}, contact = {} } = proc;
  const schedOf = (nid) => nodeSchedule[nid] || {};
  const endPlanOf = (nid, nodeRaw) => schedOf(nid).deadline || nodeRaw.end_plan || nodeRaw.period_time || nodeRaw.period || '';
  const endRealOf = (nid) => schedOf(nid).acted || nodeFinished[nid] || '';
  const nodeById = {};
  for (const n of (tree.nodes || [])) nodeById[n.id] = n;
  const fvByNode = {};
  for (const [nid, arr] of Object.entries(filled || {})) {
    if (nid.includes(':')) continue;
    fvByNode[nid] = {};
    for (const x of arr) fvByNode[nid][x.key || x.label] = x.value;
  }
  const namesOnly = (ids) => toList(ids).map((x) => String(x)).filter((id) => !id.includes('{') && !id.includes('}')).map((id) => userMap[id]).filter(Boolean);
  const valOf = (path) => {
    if (path === 'process.ID') return item.ID;
    if (path.startsWith('process.')) return item[path.slice(8)] ?? '';
    if (path === CONTACT_NODE_ID || path.startsWith(`${CONTACT_NODE_ID}.`)) {
      const k = path === CONTACT_NODE_ID ? '' : path.slice(CONTACT_NODE_ID.length + 1);
      if (!k) return contact.code ?? contact.ID ?? contact.id ?? '';
      if (k.startsWith('__tru_')) return contactTruCount(contact, k);
      return formatContactVal(contact[k]);
    }
    const m = path.match(/^node\.([^.]+)\.(.+)$/);
    if (!m) return '';
    const def = nodeById[m[1]];
    if (!def) return '';
    const rest = m[2];
    const nodeRaw = (proc.rawNodes || {})[m[1]] || {};
    if (rest === 'node_id' || rest === 'type' || rest === 'title') return nodeRaw[rest] ?? def[rest === 'node_id' ? 'id' : rest] ?? '';
    if (rest === 'user_name') {
      const from = (def.fields || []).find((x) => x.path === path);
      const src = from && from.from;
      return namesOnly(nodeRaw[src]).join(', ');
    }
    if (['user_ids', 'users', 'userId'].includes(rest)) {
      const ids = toList(nodeRaw[rest]).map(String).filter((id) => !id.includes('{') && !id.includes('}'));
      return ids.join(', ');
    }
    if (rest === 'status') {
      return deriveNodeStatus({
        rawStatus: nodeStatus[m[1]],
        endPlanRaw: endPlanOf(m[1], nodeRaw),
        endRealRaw: endRealOf(m[1]),
        isOverdue: schedOf(m[1]).isOverdue,
      });
    }
    if (rest === 'end_plan') return cleanVal(endPlanOf(m[1], nodeRaw));
    if (rest === 'end_real') return endRealOf(m[1]);
    if (rest.startsWith('form.')) {
      const kw = rest.slice(5);
      const fv = fvByNode[m[1]] || {};
      if (fv[kw] !== undefined) return cleanVal(fv[kw]);
      const alt = Object.entries(fv).find(([k]) => k.replace(/[{}]/g, '') === kw.replace(/[{}]/g, ''));
      if (alt) return cleanVal(alt[1]);
      const formPaths = (def.fields || []).filter((x) => x.path.startsWith(`node.${m[1]}.form.`)).map((x) => x.path);
      const idx = formPaths.indexOf(`node.${m[1]}.${rest}`);
      if (idx >= 0) {
        const vals = Object.values(fv);
        if (idx < vals.length) return cleanVal(vals[idx]);
      }
      return '';
    }
    if (rest.startsWith('condition.')) {
      const i = parseInt(rest.slice(10), 10);
      const f = (def.fields || []).find((x) => x.path === path);
      return f ? f.label.replace(/^Nhánh: /, '') : (nodeRaw.inputs && nodeRaw.inputs[i] ? nodeRaw.inputs[i].name : '');
    }
    if (['period', 'desc', 'method', 'url', 'content', 'object', 'event'].includes(rest)) return cleanVal(nodeRaw[rest]);
    if (rest === 'signers') return (nodeRaw.dataSigners || []).join(', ');
    return '';
  };
  return mappings.map((mp) => valOf(mp.source_path));
};

const FINISH_TIME_KEYS = ['finished_at', 'finish_at', 'end_at', 'completed_at', 'complete_at', 'done_at', 'closed_at', 'updated_at', 'modified_at', 'created_at'];

const PROPOSAL_CODE_RE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_\d{4}\b/g;

const extractContactCodes = (item) => {
  const codes = [];
  if (item && typeof item === 'object') {
    for (const k of ['contact_code', 'customer_code', 'code', 'contactCode', 'object_code']) {
      const v = item[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') codes.push(String(v).trim());
    }
    for (const k of ['contact', 'customer', 'object']) {
      const v = item[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const kk of ['code', 'contact_code']) {
          if (v[kk] !== undefined && v[kk] !== null && String(v[kk]).trim() !== '') codes.push(String(v[kk]).trim());
        }
      }
    }
    for (const k of ['title', 'process_name', 'name', 'desc']) {
      const v = item[k];
      if (v === undefined || v === null) continue;
      const found = String(v).match(PROPOSAL_CODE_RE);
      if (found) found.forEach((x) => codes.push(x));
    }
  }
  return [...new Set(codes)];
};

const findProposalByCode = async (code) => {
  const clean = String(code || '').trim();
  if (!clean) return null;
  const [rows] = await pool.query(
    `SELECT * FROM station_proposals
     WHERE contact_1office_code = ? OR tracking_code = ?
        OR JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.ma_de_xuat')) = ?
     LIMIT 1`,
    [clean, clean, clean]
  );
  return rows.length > 0 ? rows[0] : null;
};

const buildWebContact = async (proposal, code) => {
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  let merged = dynamicUtils.mergeData(proposal, fieldDefs);
  try { merged = await dynamicUtils.enrichUserFields(merged, fieldDefs); } catch { /* silent */ }
  const resolvedCode = code || merged.tracking_code || merged.ma_de_xuat
    || (merged.custom_data && merged.custom_data.ma_de_xuat) || '';
  merged.code = resolvedCode;
  return merged;
};

const resolveWebProposalContact = async (item, withContact) => {
  if (!withContact) return {};
  const codes = extractContactCodes(item);
  if (codes.length === 0) return {};
  for (const code of codes.slice(0, 3)) {
    const hit = proposalCache.get(code);
    if (hit && Date.now() - hit.at < PROPOSAL_CACHE_TTL_MS) return hit.data;
    try {
      const proposal = await findProposalByCode(code);
      if (proposal) {
        const data = await buildWebContact(proposal, code);
        proposalCache.set(code, { at: Date.now(), data });
        if (proposalCache.size > 500) proposalCache.delete(proposalCache.keys().next().value);
        return data;
      }
    } catch { /* thu code tiep theo */ }
  }
  return {};
};

exports.collectProcess = async (token, processId, tree, opts = {}) => {
  const itemJ = await apiGet(token, `/api/work/process/item?id=${processId}`);
  const logJ = await apiGet(token, `/api/work/process/log?ID=${processId}&include=history`);
  const filled = {};
  const nodeStatus = {};
  const nodeFinished = {};
  const nodeSchedule = {};
  const schedOf = (nid) => {
    if (!nodeSchedule[nid]) nodeSchedule[nid] = {};
    return nodeSchedule[nid];
  };
  for (const h of (((logJ.data || {}).history) || [])) {
    if (h.node_id && Array.isArray(h.form_data) && h.form_data.length > 0) filled[h.node_id] = h.form_data;
    if (h.node_id && h.status) nodeStatus[h.node_id] = h.status;
    if (h.node_id && h && typeof h === 'object') {
      for (const k of FINISH_TIME_KEYS) {
        if (h[k] !== undefined && h[k] !== null && String(h[k]).trim() !== '') { nodeFinished[h.node_id] = String(h[k]); break; }
      }
      const task = (h.task && typeof h.task === 'object') ? h.task : {};
      const time = (h.time && typeof h.time === 'object') ? h.time : {};
      const deadline = [task.deadline, time.deadline].find((v) => v !== undefined && v !== null && String(v).trim() !== '');
      if (deadline !== undefined) schedOf(h.node_id).deadline = String(deadline);
      const acted = [time.acted].find((v) => v !== undefined && v !== null && String(v).trim() !== '');
      if (acted !== undefined) schedOf(h.node_id).acted = String(acted);
      if (typeof time.is_overdue === 'boolean') schedOf(h.node_id).isOverdue = time.is_overdue;
    }
  }
  const nodeById = {};
  for (const n of (tree.nodes || [])) nodeById[n.id] = n.raw || n;
  const item = itemJ.data || {};
  let contact = {};
  try { contact = await resolveWebProposalContact(item, !!opts.withContact); } catch { contact = {}; }
  return { item, filled, nodeStatus, nodeFinished, nodeSchedule, contact, tree, rawNodes: nodeById };
};

exports.getMappings = async (automationId, version) => {
  const [rows] = await pool.query(
    'SELECT source_path, sheet_col, label FROM automation_sheet_mappings WHERE automation_id = ? AND version = ? ORDER BY sheet_col ASC',
    [automationId, String(version)]
  );
  return rows;
};

exports.saveMappings = async (automationId, version, items) => {
  const v = String(version);
  const seen = new Set();
  for (const it of items) {
    if (!it.source_path || !it.sheet_col) throw Object.assign(new Error('Thieu source_path/sheet_col'), { statusCode: 400 });
    if (seen.has(it.source_path)) throw Object.assign(new Error(`Field da map: ${it.source_path}`), { statusCode: 400 });
    seen.add(it.source_path);
    if (!/^[A-Z]{1,3}$/.test(it.sheet_col)) throw Object.assign(new Error(`Cot Sheet khong hop le: ${it.sheet_col}`), { statusCode: 400 });
  }
  await pool.query('DELETE FROM automation_sheet_mappings WHERE automation_id = ? AND version = ?', [automationId, v]);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM automation_sheet_mappings WHERE automation_id = ? AND version = ?', [automationId, v]);
    for (const it of items) {
      await conn.query(
        'INSERT INTO automation_sheet_mappings (automation_id, version, source_path, sheet_col, label) VALUES (?, ?, ?, ?, ?)',
        [automationId, v, it.source_path, it.sheet_col, it.label || null]
      );
    }
    await conn.commit();
  } catch (e) {
    try { await conn.rollback(); } catch { /* silent */ }
    throw e;
  } finally {
    conn.release();
  }
  return exports.getMappings(automationId, v);
};

exports.autoMatch = async (automationId, version) => {
  const v = String(version);
  const tree = await exports.getFieldTree(v);
  const existing = await exports.getMappings(automationId, v);
  const have = new Set(existing.map((m) => m.source_path));
  let maxIdx = -1;
  for (const m of existing) {
    let n = 0;
    for (const ch of String(m.sheet_col).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    maxIdx = Math.max(maxIdx, n - 1);
  }
  const colLetterOf = (i) => {
    let s = '';
    let n = i;
    while (n >= 0) { s = String.fromCharCode((n % 26) + 65) + s; n = Math.floor(n / 26) - 1; }
    return s;
  };
  const labelOf = new Map();
  labelOf.set('process.ID', 'Process ID');
  labelOf.set('process.title', 'Tên quy trình');
  const formTitle = (label) => String(label || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  for (const n of (tree.nodes || [])) {
    if (!n || !ACTION_NODE_TYPES.has(n.type)) continue;
    labelOf.set(`node.${n.id}.status`, actionFieldLabel(n, 'status'));
    labelOf.set(`node.${n.id}.end_plan`, actionFieldLabel(n, 'end_plan'));
    labelOf.set(`node.${n.id}.end_real`, actionFieldLabel(n, 'end_real'));
    for (const f of (n.fields || [])) {
      if (!f.path.startsWith(`node.${n.id}.form.`)) continue;
      labelOf.set(f.path, actionFieldLabel(n, `form.${f.path.split('.form.')[1]}`, formTitle(f.label)));
    }
  }
  const CONTACT_AUTOMATCH = [
    ['contact.doi_tac', 'Tên liên hệ'],
    ['contact.owner_phone', 'Số điện thoại'],
    ['contact.vi_tri_lap_tru', 'Vị trí lắp đặt'],
    ['contact.mo_hinh_dau_tu', 'Mô hình đầu tư'],
    ['contact.__tru_tdt', 'Số lượng trụ TDT'],
    ['contact.__tru_nq', 'Số lượng trụ NQ'],
    ['contact.__tru_lk', 'Số lượng trụ LK'],
    ['contact.__tru_total', 'Tổng số lượng trụ'],
  ];
  for (const [p, l] of CONTACT_AUTOMATCH) labelOf.set(p, l);

  const items = existing.map((m) => ({
    source_path: m.source_path,
    sheet_col: m.sheet_col,
    label: labelOf.get(m.source_path) || m.label,
  }));
  const add = (source_path, label) => {
    if (have.has(source_path)) return;
    have.add(source_path);
    maxIdx++;
    items.push({ source_path, sheet_col: colLetterOf(maxIdx), label });
  };
  add('process.ID', labelOf.get('process.ID'));
  add('process.title', labelOf.get('process.title'));
  for (const n of (tree.nodes || [])) {
    if (!n || !ACTION_NODE_TYPES.has(n.type)) continue;
    add(`node.${n.id}.status`, labelOf.get(`node.${n.id}.status`));
    add(`node.${n.id}.end_plan`, labelOf.get(`node.${n.id}.end_plan`));
    add(`node.${n.id}.end_real`, labelOf.get(`node.${n.id}.end_real`));
    for (const f of (n.fields || [])) {
      if (!f.path.startsWith(`node.${n.id}.form.`)) continue;
      add(f.path, labelOf.get(f.path));
    }
  }
  for (const [p, l] of CONTACT_AUTOMATCH) add(p, l);
  await exports.saveMappings(automationId, v, items);
  return { version: v, total: items.length, added: items.length - existing.length };
};

exports.copyMappings = async (automationId, fromVersion, toVersion) => {
  const src = await exports.getMappings(automationId, fromVersion);
  if (!src.length) throw Object.assign(new Error(`Version ${fromVersion} chua co mapping`), { statusCode: 400 });
  return exports.saveMappings(automationId, toVersion, src.map((r) => ({ source_path: r.source_path, sheet_col: r.sheet_col, label: r.label })));
};

const normalizeMatchLabel = (s) => String(s || '').toLowerCase()
  .replace(/\{[^}]*\}/g, ' ').replace(/\([^)]*\)/g, ' ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

const tokensOf = (s) => new Set(normalizeMatchLabel(s).split(' ').filter(Boolean));

const jaccardTokens = (a, b) => {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
};

const parseBulkPath = (p) => {
  if (!p) return null;
  if (p === CONTACT_NODE_ID || p.startsWith(`${CONTACT_NODE_ID}.`)) return { scope: 'contact', nodeId: CONTACT_NODE_ID, kind: 'field' };
  if (p.startsWith('process.')) return { scope: 'process', nodeId: '', kind: 'field' };
  const m = String(p).match(/^node\.([^.]+)\.(.+)$/);
  if (!m) return null;
  const rest = m[2];
  if (rest.startsWith('form.')) return { scope: 'node', nodeId: m[1], kind: 'form' };
  return { scope: 'node', nodeId: m[1], kind: rest };
};

const colLetterOfIndex = (i) => {
  let s = '';
  let n = i;
  while (n >= 0) { s = String.fromCharCode((n % 26) + 65) + s; n = Math.floor(n / 26) - 1; }
  return s;
};

exports.bulkPlan = async (automationId, fromVersion, toVersions) => {
  const from = String(fromVersion);
  const srcTree = await exports.getFieldTree(from);
  const srcMappings = await exports.getMappings(automationId, from);
  if (!srcMappings.length) throw Object.assign(new Error(`Version ${from} chua co mapping`), { statusCode: 400 });
  const srcLabelOf = new Map();
  for (const n of (srcTree.nodes || [])) {
    for (const f of (n.fields || [])) srcLabelOf.set(f.path, f.label || '');
  }
  const targets = (Array.isArray(toVersions) ? toVersions : []).map(String).filter((v) => v && v !== from);
  if (!targets.length) throw Object.assign(new Error('Chua chon version dich'), { statusCode: 400 });
  const out = [];
  for (const v of [...new Set(targets)]) {
    let dstTree = null;
    try { dstTree = await exports.getFieldTree(v); } catch { dstTree = null; }
    if (!dstTree) { out.push({ version: v, error: `Khong tim thay cay field version ${v}` }); continue; }
    const dstPaths = new Set();
    const byNodeKind = new Map();
    for (const n of (dstTree.nodes || [])) {
      for (const f of (n.fields || [])) {
        dstPaths.add(f.path);
        const parsed = parseBulkPath(f.path);
        const kind = !parsed ? 'other' : (parsed.scope === 'node' ? `node|${parsed.nodeId}|${parsed.kind}` : `${parsed.scope}|${parsed.kind}`);
        if (!byNodeKind.has(kind)) byNodeKind.set(kind, []);
        byNodeKind.get(kind).push({ path: f.path, label: f.label || '' });
      }
    }
    const matched = [];
    const unmatched = [];
    for (const m of srcMappings) {
      const sp = m.source_path;
      const base = { sheet_col: m.sheet_col, label: m.label, src_path: sp };
      const parsedEarly = parseBulkPath(sp);
      if (parsedEarly && (parsedEarly.scope === 'process' || parsedEarly.scope === 'contact')) {
        matched.push({ ...base, dst_path: sp, how: 'exact' });
        continue;
      }
      if (dstPaths.has(sp)) { matched.push({ ...base, dst_path: sp, how: 'exact' }); continue; }
      const parsed = parsedEarly;
      let smart = null;
      if (parsed && parsed.scope === 'node') {
        const cands = byNodeKind.get(`node|${parsed.nodeId}|${parsed.kind}`) || [];
        const srcToks = tokensOf(srcLabelOf.get(sp) || m.label || '');
        let bestScore = -1;
        let second = -1;
        for (const c of cands) {
          const s = jaccardTokens(srcToks, tokensOf(c.label));
          if (s > bestScore) { second = bestScore; bestScore = s; smart = c; }
          else if (s > second) second = s;
        }
        if (!(smart && bestScore >= 0.5 && bestScore > second)) smart = null;
        else matched.push({ ...base, dst_path: smart.path, dst_label: smart.label, how: 'smart', smart_score: Number(bestScore.toFixed(2)) });
        if (smart) continue;
      }
      unmatched.push(base);
    }
    const dstHave = new Set((await exports.getMappings(automationId, v)).map((r) => r.source_path));
    out.push({
      version: v,
      matched,
      unmatched,
      dest_only: [...dstHave].filter((p) => !matched.some((mm) => mm.dst_path === p)),
    });
  }
  return { from_version: from, targets: out };
};

exports.bulkApply = async (automationId, fromVersion, toVersions, mode = 'merge') => {
  if (mode !== 'merge') throw Object.assign(new Error('Chi ho tro mode merge'), { statusCode: 400 });
  const plan = await exports.bulkPlan(automationId, fromVersion, toVersions);
  const results = [];
  for (const t of plan.targets) {
    if (t.error) { results.push({ version: t.version, error: t.error }); continue; }
    const existing = await exports.getMappings(automationId, t.version);
    const have = new Set(existing.map((m) => m.source_path));
    const usedIdx = new Set(existing.map((m) => colToIndex(m.sheet_col)));
    let maxIdx = -1;
    for (const i of usedIdx) if (i > maxIdx) maxIdx = i;
    const items = existing.map((m) => ({ source_path: m.source_path, sheet_col: m.sheet_col, label: m.label }));
    let added = 0;
    let kept = 0;
    let conflicts = 0;
    for (const mm of t.matched) {
      if (have.has(mm.dst_path)) { kept++; continue; }
      let idx = colToIndex(mm.sheet_col);
      let col = mm.sheet_col;
      if (usedIdx.has(idx)) {
        maxIdx++;
        idx = maxIdx;
        col = colLetterOfIndex(idx);
        conflicts++;
      }
      usedIdx.add(idx);
      have.add(mm.dst_path);
      items.push({ source_path: mm.dst_path, sheet_col: col, label: mm.label });
      added++;
    }
    await exports.saveMappings(automationId, t.version, items);
    results.push({
      version: t.version, added, kept, col_conflicts: conflicts,
      unmatched: t.unmatched.length, unmatched_paths: t.unmatched.map((u) => u.src_path),
      dest_only_kept: t.dest_only.length,
    });
  }
  return { from_version: plan.from_version, mode, results };
};

const colToIndex = (col) => {
  let n = 0;
  for (const ch of String(col).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

const a1Range = (tab, ref) => `'${String(tab == null ? '' : tab).replace(/'/g, "''")}'!${ref}`;

// ── Merge duplicate versions ───────────────────────────────────────
// Các version có ≥95% source_paths giống nhau → connected component
// Mỗi component giữ duy nhất newest representative
// Trả về danh sách đại diện duy nhất cho mỗi nhóm
const MERGE_SIMILARITY_THRESHOLD = 0.95;

const deduplicateVersions = async (automationId) => {
  // 1. Lấy tất cả mappings theo version, kèm timestamp mới nhất
  const [mappings] = await pool.query(
    `SELECT m.version, m.source_path, MAX(m.updated_at) AS max_updated_at
     FROM automation_sheet_mappings m
     WHERE m.automation_id = ?
     GROUP BY m.version, m.source_path
     ORDER BY m.version`,
    [automationId]
  );

  if (!mappings.length) return [];

  // 2. Group theo version: tập hợp unique source_paths + max_updated_at
  const versionMap = new Map(); // version → { paths: Set, updatedAt }
  for (const row of mappings) {
    const v = String(row.version);
    if (!versionMap.has(v)) {
      versionMap.set(v, { paths: new Set(), updatedAt: new Date(row.max_updated_at) });
    }
    versionMap.get(v).paths.add(row.source_path);
  }

  const versions = [...versionMap.keys()];
  if (versions.length <= 1) return versions;

  // 3. Connected components: edges giữa các version có Jaccard ≥ threshold
  // Union-Find đơn giản
  const parent = {};
  versions.forEach((v) => { parent[v] = v; });

  const find = (v) => {
    while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; }
    return v;
  };

  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) {
      // Luôn attach vào root có updatedAt lớn hơn → root giữ newest
      if (versionMap.get(rb).updatedAt > versionMap.get(ra).updatedAt) {
        parent[ra] = rb;
      } else {
        parent[rb] = ra;
      }
    }
  };

  // Tính Jaccard pairwise và build edges
  let mergePairs = 0;
  for (let i = 0; i < versions.length; i++) {
    const pathsA = versionMap.get(versions[i]).paths;
    for (let j = i + 1; j < versions.length; j++) {
      const pathsB = versionMap.get(versions[j]).paths;
      let inter = 0;
      for (const p of pathsA) { if (pathsB.has(p)) inter++; }
      const unionSize = pathsA.size + pathsB.size - inter;
      const jaccard = unionSize > 0 ? inter / unionSize : 0;
      if (jaccard >= MERGE_SIMILARITY_THRESHOLD) {
        union(versions[i], versions[j]);
        mergePairs++;
      }
    }
  }

  // 4. Gather components bằng root map
  const components = new Map(); // root → [versions]
  for (const v of versions) {
    const root = find(v);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(v);
  }

  // 5. Mỗi component → chọn newest representative (root đã là newest do union logic)
  const result = [];
  const dupesRemoved = [];
  for (const [root, group] of components) {
    if (group.length === 1) {
      result.push(root);
      continue;
    }
    // Root từ union-find đã là newest nhất
    result.push(root);
    for (const v of group) {
      if (v !== root) {
        dupesRemoved.push({ dupe: v, replacedBy: root, nodeCount: versionMap.get(v).paths.size });
      }
    }
  }

  // Log duplicate info
  if (dupesRemoved.length > 0) {
    console.log('[merge-dedup] Automation', automationId, 'gộp', mergePairs, 'cặp ≥' + (MERGE_SIMILARITY_THRESHOLD * 100) + '% → ',
      dupesRemoved.map((d) => `${d.dupe}→${d.replacedBy}`).join(', '));
    const byVersion = {};
    for (const d of dupesRemoved) {
      byVersion[d.replacedBy] = byVersion[d.replacedBy] || [];
      byVersion[d.replacedBy].push(d.dupe);
    }
    for (const [by, reps] of Object.entries(byVersion)) {
      console.log(`  [merge-dedup] Ver ${by}: giữ, loại ${reps.join(', ')}`);
    }
  }

  return result;
};

// ── Merge duplicate versions from field cache (for UI dropdown) ────
// So sánh tree_json (node IDs) giữa các versions → gộp các version giống nhau
// Trả về list versions đã merge + thông tin merge info
// Optional: filter theo template_ids (array)
const deduplicateFieldCacheVersions = async (automationId, templateIds = null) => {
  // 1. Lấy tất cả versions từ cache với template info
  const [cached] = await pool.query(
    `SELECT version, tree_json, fetched_at,
            JSON_UNQUOTE(JSON_EXTRACT(tree_json, '$.template')) AS template,
            JSON_UNQUOTE(JSON_EXTRACT(tree_json, '$.template_id')) AS template_id,
            JSON_LENGTH(tree_json, '$.nodes') AS node_count
     FROM automation_field_cache
     ORDER BY fetched_at DESC`,
    []
  );

  if (!cached.length) return { versions: [], mergeInfo: [] };

  // 2. Filter theo template_ids nếu được truyền
  let filtered = cached;
  if (templateIds && templateIds.length > 0) {
    const idSet = new Set(templateIds.map(String));
    filtered = cached.filter((r) => idSet.has(String(r.template)) || idSet.has(String(r.template_id)));
  }

  if (!filtered.length) return { versions: [], mergeInfo: [] };

  // 3. Parse tree và extract unique NODE IDs per version (không so sánh field paths)
  const versionMap = new Map(); // version → { nodeIds: Set, info: {...} }
  for (const row of filtered) {
    const v = String(row.version);
    const tree = typeof row.tree_json === 'string' ? JSON.parse(row.tree_json) : row.tree_json;
    const nodeIds = new Set();

    // Extract only node IDs (not field paths)
    const nodes = tree.nodes || [];
    for (const node of nodes) {
      if (node && node.id) {
        nodeIds.add('node.' + node.id); // Only node ID, no wildcard
      }
    }

    versionMap.set(v, {
      nodeIds,
      info: {
        version: v,
        template: row.template || '',
        template_id: row.template_id || '',
        node_count: row.node_count || 0,
        fetched_at: row.fetched_at,
      }
    });
  }

  const versions = [...versionMap.keys()];
  if (versions.length <= 1) {
    return { versions: filtered.map((r) => ({ version: r.version, template: r.template, template_id: r.template_id, nodes: r.node_count })), mergeInfo: [] };
  }

  // 4. Connected components via union-find on Jaccard similarity (node IDs only)
  const parent = {};
  versions.forEach((v) => { parent[v] = v; });

  const find = (v) => {
    while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; }
    return v;
  };

  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) {
      // Attach to root with newer fetched_at
      const ta = new Date(versionMap.get(ra).info.fetched_at);
      const tb = new Date(versionMap.get(rb).info.fetched_at);
      if (tb > ta) { parent[ra] = rb; } else { parent[rb] = ra; }
    }
  };

  let mergePairs = 0;
  for (let i = 0; i < versions.length; i++) {
    const idsA = versionMap.get(versions[i]).nodeIds;
    const countA = versionMap.get(versions[i]).info.node_count;
    for (let j = i + 1; j < versions.length; j++) {
      const idsB = versionMap.get(versions[j]).nodeIds;
      const countB = versionMap.get(versions[j]).info.node_count;

      // ONLY merge if same node count (requirement: 56 and 57 nodes cannot merge)
      if (countA !== countB) continue;

      let inter = 0;
      for (const p of idsA) { if (idsB.has(p)) inter++; }
      const unionSize = idsA.size + idsB.size - inter;
      const jaccard = unionSize > 0 ? inter / unionSize : 0;
      if (jaccard >= MERGE_SIMILARITY_THRESHOLD) {
        union(versions[i], versions[j]);
        mergePairs++;
      }
    }
  }

  // 5. Gather components
  const components = new Map();
  for (const v of versions) {
    const root = find(v);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(v);
  }

  // 6. Build result: keep newest representative per component
  const resultVersions = [];
  const mergeInfo = [];

  for (const [root, group] of components) {
    // Sort group by fetched_at descending to get newest first
    group.sort((a, b) => new Date(versionMap.get(b).info.fetched_at) - new Date(versionMap.get(a).info.fetched_at));
    const leader = group[0];

    if (group.length === 1) {
      resultVersions.push(versionMap.get(leader).info);
    } else {
      resultVersions.push(versionMap.get(leader).info);
      for (const v of group.slice(1)) {
        mergeInfo.push({
          duplicate: v,
          keptAs: leader,
          reason: 'similar_structure',
          similarity: '≥95%',
          duplicateNodes: versionMap.get(v).info.node_count,
          keptNodes: versionMap.get(leader).info.node_count,
        });
      }
    }
  }

  // Log merge info
  if (mergeInfo.length > 0) {
    console.log('[merge-cache] Gộp', mergeInfo.length, 'versions giống nhau → giữ', resultVersions.length, 'versions duy nhất');
    const byVersion = {};
    for (const m of mergeInfo) {
      byVersion[m.keptAs] = byVersion[m.keptAs] || [];
      byVersion[m.keptAs].push(m.duplicate);
    }
    for (const [kept, dups] of Object.entries(byVersion)) {
      console.log(`  [merge-cache] Ver ${kept}: giữ, loại ${dups.join(', ')}`);
    }
  }

  return { versions: resultVersions, mergeInfo };
};

const versionsWithMappings = async (automationId, onlyVersion, auto) => {
  // 1. Lấy tất cả versions từ cache
  const [cachedRows] = await pool.query(
    'SELECT DISTINCT version FROM automation_field_cache ORDER BY version'
  );
  let all = cachedRows.map((r) => String(r.version));

  // 2. Filter theo allowed versions (template_process_ids)
  let allowedVersions = all;
  if (auto) {
    const allowed = await allowedVersionsForAuto(auto);
    if (allowed !== null) {
      const allowedSet = new Set(allowed.map(String));
      allowedVersions = all.filter((v) => allowedSet.has(String(v)));
    }
  }

  // 3. Nếu chỉ định 1 version cụ thể, trả về ngay
  if (onlyVersion) {
    if (!allowedVersions.includes(String(onlyVersion))) throw Object.assign(new Error(`Version ${onlyVersion} chua co mapping (hoac khong thuoc quy trinh mau da chon)`), { statusCode: 400 });
    return [String(onlyVersion)];
  }

  // 4. Merge các version giống nhau (chỉ trong nhóm allowedVersions)
  // Lấy data từ cache đã filter
  const [filteredCache] = await pool.query(
    `SELECT version, tree_json, fetched_at,
            JSON_UNQUOTE(JSON_EXTRACT(tree_json, '$.template')) AS template,
            JSON_UNQUOTE(JSON_EXTRACT(tree_json, '$.template_id')) AS template_id,
            JSON_LENGTH(tree_json, '$.nodes') AS node_count
     FROM automation_field_cache
     WHERE version IN (${allowedVersions.map((v) => `'${v}'`).join(',')})
     ORDER BY fetched_at DESC`
  );

  // Call deduplicateFieldCacheVersions với filtered data
  const { versions: mergedVersions, mergeInfo } = await exports.deduplicateFieldCacheVersionsFromFiltered(automationId, filteredCache, allowedVersions);

  // 5. Filter: chỉ giữ các version đã được merge (newest representative)
  const mergedSet = new Set(mergedVersions.map((v) => String(v.version)));
  const filtered = allowedVersions.filter((v) => mergedSet.has(v));

  // Log merge info
  console.log(`[versionsWithMappings] Automation ${automationId}:`);
  console.log(`  Total in cache: ${all.length}`);
  console.log(`  After template filter: ${allowedVersions.length}`);
  console.log(`  After merge: ${filtered.length} (kept versions: ${filtered.join(', ')})`);
  if (mergeInfo && mergeInfo.length > 0) {
    console.log(`  Merged: ${mergeInfo.length} versions`);
    for (const m of mergeInfo) {
      console.log(`    V${m.duplicate} → V${m.keptAs} (${m.duplicateNodes}→${m.keptNodes} nodes)`);
    }
  }

  return filtered.length > 0 ? filtered : allowedVersions;
};

const buildVersionRows = async (auto, token, userMap, version, mappings, processIds, limit = 0) => {
  const tree = await exports.getFieldTree(version);
  const headers = ['Process ID'];
  const order = [...mappings].sort((a, b) => colToIndex(a.sheet_col) - colToIndex(b.sheet_col));
  for (const mp of order) headers[colToIndex(mp.sheet_col)] = mp.label || mp.source_path;
  for (let i = 0; i < headers.length; i++) if (headers[i] === undefined) headers[i] = '';
  const ids = limit > 0 ? processIds.slice(0, limit) : processIds;
  const rows = [];
  const unmapped = new Set();
  const withContact = mappings.some((mp) => mp && mp.source_path && (mp.source_path === CONTACT_NODE_ID || mp.source_path.startsWith(`${CONTACT_NODE_ID}.`)));
  for (const pid of ids) {
    try {
      const proc = await exports.collectProcess(token, pid, tree, { withContact });
      const vals = await exports.resolveRow(proc, order, userMap);
      const row = [String(pid)];
      order.forEach((mp, i) => { row[colToIndex(mp.sheet_col)] = vals[i] ?? ''; });
      for (let i = 0; i < headers.length; i++) if (row[i] === undefined) row[i] = '';
      rows.push(row);
    } catch (e) {
      unmapped.add(`${pid}: ${e.message}`);
    }
    await new Promise((x) => setTimeout(x, 1000));
  }
  return { headers, rows, unmapped: [...unmapped] };
};

const insertRun = async (automationId, patch) => {
  const cols = ['automation_id'];
  const params = [automationId];
  for (const [k, v] of Object.entries(patch)) {
    cols.push(`\`${k}\``);
    params.push(v === undefined || v === null ? null : (v instanceof Date || typeof v !== 'object' ? v : JSON.stringify(v)));
  }
  const [r] = await pool.query(`INSERT INTO work_automation_runs (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, params);
  return r.insertId;
};

// Lấy mappings effective cho một version (nếu version không có mappings, dùng mappings của version cha trong merge group)
const getEffectiveMappings = async (automationId, version, templateIds = null) => {
  const mappings = await exports.getMappings(automationId, version);
  if (mappings.length > 0) return mappings;

  // Chỉ xét các version thuộc quy trình mẫu đã chọn (templateIds)
  const { versions: mergedVersions, mergeInfo } = await exports.deduplicateFieldCacheVersions(automationId, templateIds);

  // Version không có mappings → lấy mappings của version cùng nhóm merge (nếu có)
  const dups = mergeInfo.filter((m) => String(m.keptAs) === String(version)).map((m) => m.duplicate);
  for (const dup of dups) {
    const dupMappings = await exports.getMappings(automationId, dup);
    if (dupMappings.length > 0) return dupMappings;
  }

  // Vẫn không có → dùng mappings của version khác TRONG CÙNG lựa chọn
  for (const v of mergedVersions) {
    if (String(v.version) !== String(version)) {
      const vMappings = await exports.getMappings(automationId, v.version);
      if (vMappings.length > 0) return vMappings;
    }
  }

  return mappings; // trả về empty array nếu không tìm thấy
};

// Lấy danh sách process IDs cho một version (bao gồm cả các version đã merge vào nó)
const getProcessIdsForVersion = async (auto, targetVersion, roots, { limit = 0, templateIds = null } = {}) => {
  const ids = [];
  // Chỉ merge trong phạm vi quy trình mẫu đã chọn (templateIds)
  const { mergeInfo } = await exports.deduplicateFieldCacheVersions(auto.id, templateIds);

  // Tìm tất cả versions đã merge vào targetVersion
  const relatedVersions = new Set([String(targetVersion)]);
  for (const m of mergeInfo) {
    if (String(m.keptAs) === String(targetVersion)) {
      relatedVersions.add(String(m.duplicate));
    }
  }

  // Lấy processes cho tất cả related versions
  for (const r of roots) {
    try {
      const procVersion = String(await exports.versionOf(auto, r.ID));
      if (relatedVersions.has(procVersion)) {
        ids.push(r.ID);
      }
    } catch { /* silent */ }
    if (limit > 0 && ids.length >= limit) break;
    await new Promise((x) => setTimeout(x, 300));
  }

  return ids;
};

exports.runSync = async (auto, { version, trigger = 'manual', runId = 0 } = {}) => {
  if (!auto.spreadsheet_id) throw Object.assign(new Error('Chua cau hinh Sheet ID'), { statusCode: 400 });
  const fresh = await workAutomationService.getByKey(auto.automation_key).catch(() => null);
  const effAuto = fresh || auto;
  const token = await getWorkToken(effAuto);
  const userMap = await exports.getUserMap();
  let roots = await exports.listRoots(effAuto);
  const tplIds = parseTemplateIds(effAuto);
  if (tplIds.length > 0) {
    const nameSet = new Set(tplIds.map(String));
    roots = roots.filter((r) => nameSet.has(String(r.process_type_id)));
  }
  await pool.query('UPDATE work_automations SET last_run_at = NOW() WHERE id = ?', [effAuto.id]).catch(() => {});
  const googleSheetService = require('./googleSheetService');
  const result = { versions: {}, unmapped: [], failed: [] };
  const targetVersions = await versionsWithMappings(effAuto.id, version, effAuto);
  if (targetVersions.length === 0) {
    const note = 'Khong co version nao thuoc quy trinh mau da chon (hoac chua co mapping)';
    const payload = { versions: {}, note };
    if (runId) {
      await pool.query('UPDATE work_automation_runs SET status = ?, error = NULL, response_json = ?, finished_at = NOW() WHERE id = ?', ['success', JSON.stringify(payload), runId]);
    } else {
      runId = await insertRun(effAuto.id, {
        proposal_code: null, trigger, action: 'sync_to_sheet', status: 'success',
        request_json: { version: version || 'all' }, response_json: payload, finished_at: new Date(),
      });
    }
    return { run_id: runId, ...result, note };
  }
  for (const v of targetVersions) {
    try {
      // Lấy mappings effective (chỉ trong phạm vi quy trình mẫu đã chọn)
      const mappings = await getEffectiveMappings(effAuto.id, v, tplIds);
      if (!mappings.length) {
        console.log(`[runSync] Version ${v} khong co mapping, skip`);
        result.versions[v] = { processes: 0, note: 'Khong tim thay mapping' };
        continue;
      }
      // Lấy process IDs (bao gồm cả các version đã merge vào version này, trong lựa chọn)
      const ids = await getProcessIdsForVersion(effAuto, v, roots, { templateIds: tplIds });
      const tab = `Ver ${v}`;
      const mapSig = JSON.stringify(mappings.map((m) => [m.source_path, m.sheet_col, m.label || '']));
      const [stRows] = await pool.query('SELECT mapping_json FROM automation_sync_state WHERE automation_id = ? AND version = ?', [auto.id, String(v)]);
      const prevSig = !stRows.length ? null : (typeof stRows[0].mapping_json === 'string' ? stRows[0].mapping_json : JSON.stringify(stRows[0].mapping_json));
      const structureChanged = prevSig !== mapSig;
      await pool.query('UPDATE work_automations SET last_run_at = NOW() WHERE id = ?', [auto.id]);
      const { headers, rows, unmapped } = await buildVersionRows(auto, token, userMap, v, mappings, ids);
      result.unmapped.push(...unmapped);
      if (rows.length === 0) {
        result.versions[v] = { processes: 0, note: 'Khong tim thay quy trinh' };
        continue;
      }
      const minCols = Math.max(headers.length, ...mappings.map((m) => colToIndex(m.sheet_col) + 1));
      const created = await googleSheetService.ensureTab(auto.spreadsheet_id, tab, minCols);
      const colA = await googleSheetService.readColumnA(auto.spreadsheet_id, tab);
      const sheetEmpty = colA.length === 0 || colA.every((v) => !v);
      if (structureChanged || sheetEmpty) {
        await googleSheetService.clearTab(auto.spreadsheet_id, tab);
        const wr = await googleSheetService.upsertRows(auto.spreadsheet_id, tab, headers, rows);
        await pool.query(
          `INSERT INTO automation_sync_state (automation_id, version, mapping_json) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE mapping_json = VALUES(mapping_json)`,
          [auto.id, String(v), mapSig]
        );
        await pool.query('DELETE FROM automation_sync_snapshots WHERE automation_id = ? AND version = ?', [auto.id, String(v)]);
      for (const row of rows) {
        const cells = {};
        row.forEach((val, i) => { cells[i] = String(val ?? ''); });
        const codes = reportMirrorService.decodeRowCodes(mappings, cells);
        await pool.query(
          `INSERT INTO automation_sync_snapshots (automation_id, version, process_id, cells_json, proposal_code, contact_code) VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE cells_json = VALUES(cells_json), proposal_code = VALUES(proposal_code), contact_code = VALUES(contact_code)`,
          [auto.id, String(v), String(row[0]), JSON.stringify(cells), codes.proposal_code, codes.contact_code]
        );
      }
      result.versions[v] = { processes: rows.length, tab, tab_created: created.created, full_overwrite: true, ...wr };
      continue;
    }
    // Fetch snapshot để sớm kiểm tra thay đổi
    const [snaps] = await pool.query('SELECT process_id, cells_json FROM automation_sync_snapshots WHERE automation_id = ? AND version = ?', [auto.id, String(v)]);
    const prev = new Map(snaps.map((s) => [String(s.process_id), typeof s.cells_json === 'string' ? JSON.parse(s.cells_json) : s.cells_json]));
    // Early-exit: structure không đổi + tất cả row giống snapshot → bỏ qua hết
    let anyChanged = false;
    if (!structureChanged) {
      for (const row of rows) {
        const pid = String(row[0]);
        const oldSnap = prev.get(pid);
        if (!oldSnap) { anyChanged = true; break; }
        const match = row.every((val, i) => String(val ?? '') === (oldSnap[String(i)] ?? ''));
        if (!match) { anyChanged = true; break; }
      }
      if (!anyChanged) {
        result.versions[v] = {
          processes: rows.length, tab, tab_created: false,
          inserted: 0, cells_written: 0, changed_cells: 0,
          note: 'khong thay doi', changed_sample: [],
        };
        continue;
      }
    }
    const colAData = await googleSheetService.readColumnA(auto.spreadsheet_id, tab);
    const rowOf = new Map();
    colAData.forEach((val, i) => { if (val && !rowOf.has(String(val))) rowOf.set(String(val), i + 1); });
    let nextRow = colAData.length + 1;
    const updates = [];
    const changed = [];
    let inserted = 0;
    const colLetterOf = (i) => {
      let s = '';
      let n = i;
      while (n >= 0) { s = String.fromCharCode((n % 26) + 65) + s; n = Math.floor(n / 26) - 1; }
      return s;
    };
    for (const row of rows) {
      const pid = String(row[0]);
      const rowNum = rowOf.get(pid);
      const oldSnap = prev.get(pid);
      if (!oldSnap || !rowNum) {
        const at = rowNum || nextRow++;
        row.forEach((val, i) => {
          updates.push({ range: a1Range(tab, `${colLetterOf(i)}${at}`), values: [[String(val ?? '')]] });
        });
        if (!rowNum) { rowOf.set(pid, at); inserted++; }
        changed.push({ process_id: pid, row: at, type: 'new_row' });
        continue;
      }
      row.forEach((val, i) => {
        const cur = String(val ?? '');
        if ((oldSnap[String(i)] ?? '') !== cur) {
          const col = colLetterOf(i);
          updates.push({ range: a1Range(tab, `${col}${rowNum}`), values: [[cur]] });
          if (changed.length < 50) changed.push({ process_id: pid, row: rowNum, col, old: oldSnap[String(i)] ?? '', new: cur });
        }
      });
    }
    let wrote = { updated: 0 };
    if (updates.length > 0) wrote = await googleSheetService.updateCells(auto.spreadsheet_id, updates);
    for (const row of rows) {
      const cells = {};
      row.forEach((val, i) => { cells[i] = String(val ?? ''); });
      const codes = reportMirrorService.decodeRowCodes(mappings, cells);
      await pool.query(
        `INSERT INTO automation_sync_snapshots (automation_id, version, process_id, cells_json, proposal_code, contact_code) VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE cells_json = VALUES(cells_json), proposal_code = VALUES(proposal_code), contact_code = VALUES(contact_code)`,
        [auto.id, String(v), String(row[0]), JSON.stringify(cells), codes.proposal_code, codes.contact_code]
      );
    }
    await pool.query(
      `INSERT INTO automation_sync_state (automation_id, version, mapping_json) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE mapping_json = VALUES(mapping_json)`,
      [auto.id, String(v), mapSig]
    );
    result.versions[v] = {
      processes: rows.length, tab, tab_created: created.created,
      changed_cells: changed.length, inserted, cells_written: wrote.updated,
      note: updates.length === 0 ? 'khong thay doi' : undefined,
      changed_sample: changed.slice(0, 10),
    };
    } catch (e) {
      result.failed.push({ version: v, error: e.message || 'Loi khong xac dinh' });
      result.versions[v] = { processes: 0, status: 'failed', error: e.message || 'Loi khong xac dinh' };
    }
  }
  const failedCount = (result.failed || []).length;
  const status = failedCount > 0 ? 'failed' : 'success';
  const errorMsg = failedCount > 0 ? result.failed.map((f) => `Ver ${f.version}: ${f.error}`).join('; ').slice(0, 1000) : null;
  if (runId) {
    await pool.query('UPDATE work_automation_runs SET status = ?, error = ?, response_json = ?, finished_at = NOW() WHERE id = ?', [status, errorMsg, JSON.stringify(result), runId]);
  } else {
    runId = await insertRun(effAuto.id, {
      proposal_code: null, trigger, action: 'sync_to_sheet', status,
      request_json: { version: version || 'all' }, response_json: result, finished_at: new Date(),
    });
  }
  return { run_id: runId, ...result };
};

exports.dryRun = async (auto, { version, limit = 3 } = {}) => {
  if (!auto.spreadsheet_id) throw Object.assign(new Error('Chua cau hinh Sheet ID'), { statusCode: 400 });
  const fresh = await workAutomationService.getByKey(auto.automation_key).catch(() => null);
  const effAuto = fresh || auto;
  const token = await getWorkToken(effAuto);
  const userMap = await exports.getUserMap();
  let roots = await exports.listRoots(effAuto);
  const tplIds = parseTemplateIds(effAuto);
  if (tplIds.length > 0) {
    const nameSet = new Set(tplIds.map(String));
    roots = roots.filter((r) => nameSet.has(String(r.process_type_id)));
  }
  const preview = {};
  for (const v of await versionsWithMappings(effAuto.id, version, effAuto)) {
    // Dùng CÙNG logic với runSync để bản xem trước khớp thật
    const mappings = await getEffectiveMappings(effAuto.id, v, tplIds);
    if (!mappings.length) { preview[v] = { tab: `Ver ${v}`, headers: [], rows: [], note: 'Khong tim thay mapping' }; continue; }
    const ids = await getProcessIdsForVersion(effAuto, v, roots, { limit, templateIds: tplIds });
    const { headers, rows } = await buildVersionRows(effAuto, token, userMap, v, mappings, ids, limit);
    preview[v] = { tab: `Ver ${v}`, headers, rows };
  }
  return { dry_run: true, preview };
};

exports.sampleExcel = async (auto, version) => {
  const ExcelJS = require('exceljs');
  const fresh = await workAutomationService.getByKey(auto.automation_key).catch(() => null);
  const effAuto = fresh || auto;
  const token = await getWorkToken(effAuto);
  const userMap = await exports.getUserMap();
  let roots = await exports.listRoots(effAuto);
  const tplIds = parseTemplateIds(effAuto);
  if (tplIds.length > 0) {
    const nameSet = new Set(tplIds.map(String));
    roots = roots.filter((r) => nameSet.has(String(r.process_type_id)));
  }
  await versionsWithMappings(effAuto.id, version, effAuto);
  const mappings = await getEffectiveMappings(effAuto.id, version, tplIds);
  if (!mappings.length) throw Object.assign(new Error(`Version ${version} chua co mapping`), { statusCode: 400 });
  const ids = await getProcessIdsForVersion(effAuto, version, roots, { limit: 3, templateIds: tplIds });
  const { headers, rows } = await buildVersionRows(effAuto, token, userMap, version, mappings, ids, 3);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Ver ${version} mau`);
  ws.columns = headers.map((h, i) => ({ header: h || `Cot ${i + 1}`, key: `c${i}`, width: i === 0 ? 12 : 30 }));
  ws.getRow(1).font = { bold: true };
  for (const row of rows) {
    const r = ws.addRow(row);
    r.alignment = { wrapText: true, vertical: 'top' };
  }
  return wb.xlsx.writeBuffer();
};

// Version của deduplicateFieldCacheVersions nhận data đã filter sẵn
const deduplicateFieldCacheVersionsFromFiltered = async (automationId, filteredCache, allowedVersions) => {
  if (!filteredCache.length) return { versions: [], mergeInfo: [] };

  // Parse tree và extract unique NODE IDs per version
  const versionMap = new Map();
  for (const row of filteredCache) {
    const v = String(row.version);
    const tree = typeof row.tree_json === 'string' ? JSON.parse(row.tree_json) : row.tree_json;
    const nodeIds = new Set();

    const nodes = tree.nodes || [];
    for (const node of nodes) {
      if (node && node.id) {
        nodeIds.add('node.' + node.id);
      }
    }

    versionMap.set(v, {
      nodeIds,
      info: {
        version: v,
        template: row.template || '',
        template_id: row.template_id || '',
        node_count: row.node_count || 0,
        fetched_at: row.fetched_at,
      }
    });
  }

  const versions = [...versionMap.keys()];
  if (versions.length <= 1) {
    return { versions: filteredCache.map((r) => ({ version: r.version, template: r.template, template_id: r.template_id, nodes: r.node_count })), mergeInfo: [] };
  }

  // Connected components via union-find on Jaccard similarity (node IDs only)
  const parent = {};
  versions.forEach((v) => { parent[v] = v; });

  const find = (v) => {
    while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; }
    return v;
  };

  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) {
      const ta = new Date(versionMap.get(ra).info.fetched_at);
      const tb = new Date(versionMap.get(rb).info.fetched_at);
      if (tb > ta) { parent[ra] = rb; } else { parent[rb] = ra; }
    }
  };

  let mergePairs = 0;
  for (let i = 0; i < versions.length; i++) {
    const idsA = versionMap.get(versions[i]).nodeIds;
    const countA = versionMap.get(versions[i]).info.node_count;
    for (let j = i + 1; j < versions.length; j++) {
      const idsB = versionMap.get(versions[j]).nodeIds;
      const countB = versionMap.get(versions[j]).info.node_count;

      // ONLY merge if same node count
      if (countA !== countB) continue;

      let inter = 0;
      for (const p of idsA) { if (idsB.has(p)) inter++; }
      const unionSize = idsA.size + idsB.size - inter;
      const jaccard = unionSize > 0 ? inter / unionSize : 0;
      if (jaccard >= MERGE_SIMILARITY_THRESHOLD) {
        union(versions[i], versions[j]);
        mergePairs++;
      }
    }
  }

  // Gather components
  const components = new Map();
  for (const v of versions) {
    const root = find(v);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(v);
  }

  // Build result: keep newest representative per component
  const resultVersions = [];
  const mergeInfo = [];

  for (const [root, group] of components) {
    group.sort((a, b) => new Date(versionMap.get(b).info.fetched_at) - new Date(versionMap.get(a).info.fetched_at));
    const leader = group[0];

    if (group.length === 1) {
      resultVersions.push(versionMap.get(leader).info);
    } else {
      resultVersions.push(versionMap.get(leader).info);
      for (const v of group.slice(1)) {
        mergeInfo.push({
          duplicate: v,
          keptAs: leader,
          reason: 'similar_structure',
          similarity: '≥95%',
          duplicateNodes: versionMap.get(v).info.node_count,
          keptNodes: versionMap.get(leader).info.node_count,
        });
      }
    }
  }

  if (mergeInfo.length > 0) {
    console.log(`[deduplicateFieldCacheVersionsFromFiltered] Automation ${automationId}: Gộp ${mergeInfo.length} versions → giữ ${resultVersions.length} versions`);
  }

  return { versions: resultVersions, mergeInfo };
};

exports.deduplicateVersions = deduplicateVersions;
exports.deduplicateFieldCacheVersions = deduplicateFieldCacheVersions;
exports.deduplicateFieldCacheVersionsFromFiltered = deduplicateFieldCacheVersionsFromFiltered;
