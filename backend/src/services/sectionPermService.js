const pool = require('../utils/db');

const toList = (v) => {
  if (v === undefined || v === null) return [];
  const arr = Array.isArray(v) ? v : String(v).split(',');
  return arr.map((x) => String(x ?? '').trim()).filter(Boolean);
};

const normalizeRule = (rule) => {
  const r = (rule && typeof rule === 'object') ? rule : {};
  return {
    roles: toList(r.roles),
    departments: toList(r.departments),
    positions: toList(r.positions || r.chuc_vu),
    user_ids: toList(r.user_ids || r.users).map((x) => String(x).replace(/^#/, '')),
  };
};

const isRuleEmpty = (rule) => {
  const n = normalizeRule(rule);
  return n.roles.length === 0 && n.departments.length === 0
    && n.positions.length === 0 && n.user_ids.length === 0;
};

const parseCustomData = (val) => {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return {}; }
};

const normScalar = (v) => {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') {
    const id = v.id ?? v.user_id ?? v.value;
    if (id !== undefined && id !== null) return String(id).trim();
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v).trim();
};

const DATE_LIKE_RE = /^\d{4}-\d{2}-\d{2}([T\s]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

const sameValue = (a, b) => {
  const aObj = a && typeof a === 'object';
  const bObj = b && typeof b === 'object';
  if (aObj || bObj || Array.isArray(a) || Array.isArray(b)) {
    try { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); } catch { return false; }
  }
  const sa = normScalar(a);
  const sb = normScalar(b);
  if (sa === '' && sb === '') return true;
  if (sa === '' || sb === '') return false;
  if (!isNaN(Number(sa)) && !isNaN(Number(sb))) return Number(sa) === Number(sb);
  if (sa !== sb && DATE_LIKE_RE.test(sa) && DATE_LIKE_RE.test(sb)) {
    const ta = new Date(sa).getTime();
    const tb = new Date(sb).getTime();
    if (!isNaN(ta) && !isNaN(tb)) return ta === tb;
  }
  return sa === sb;
};

const currentOf = (before, key) => {
  if (!before) return undefined;
  if (before[key] !== undefined) return before[key];
  const cd = parseCustomData(before.custom_data);
  return cd[key];
};

const eqFold = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

const matchRule = (rule, ctx) => {
  if (isRuleEmpty(rule)) return true;
  const n = normalizeRule(rule);
  const c = ctx || {};
  if (n.roles.length > 0 && n.roles.some((r) => eqFold(r, c.role))) return true;
  if (n.departments.length > 0 && n.departments.some((d) => eqFold(d, c.department))) return true;
  if (n.positions.length > 0 && n.positions.some((p) => eqFold(p, c.chuc_vu))) return true;
  if (n.user_ids.length > 0 && c.id !== null && c.id !== undefined
    && n.user_ids.some((x) => String(x) === String(c.id))) return true;
  return false;
};

const getUserCtx = async (user, conn = pool) => {
  if (!user) return { id: null, role: '', department: '', chuc_vu: '' };
  if (user.department !== undefined || user.chuc_vu !== undefined) {
    return {
      id: user.id ?? null,
      role: user.role || '',
      department: user.department || '',
      chuc_vu: user.chuc_vu || '',
    };
  }
  const [rows] = await conn.query('SELECT role, custom_data FROM users WHERE id = ? LIMIT 1', [user.id]);
  const cd = parseCustomData(rows[0] && rows[0].custom_data);
  return {
    id: user.id ?? null,
    role: (rows[0] && rows[0].role) || user.role || '',
    department: cd.department || '',
    chuc_vu: cd.chuc_vu || '',
  };
};

const parseLayout = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
};

const getSectionPerms = (section) => {
  const p = (section && section.permissions && typeof section.permissions === 'object') ? section.permissions : {};
  return {
    hasView: p.view !== undefined && p.view !== null && !isRuleEmpty(p.view),
    hasEdit: p.edit !== undefined && p.edit !== null && !isRuleEmpty(p.edit),
    view: p.view || null,
    edit: p.edit || null,
  };
};

const normTitle = (s) => String(s || '').toLowerCase();
const sectionKind = (title) => {
  const t = normTitle(title);
  if (!t) return null;
  if (t.includes('tvbh') || t.includes('tư vấn bán hàng') || t.includes('tu van ban hang')) return 'tvbh';
  if (t.includes('cskh') || t.includes('chăm sóc') || t.includes('cham soc')) return 'cskh';
  if (t.includes('marketing')) return 'marketing';
  return null;
};

const getLeadFormFieldSections = async (conn = pool) => {
  const [forms] = await conn.query(
    "SELECT id, layout_config FROM forms WHERE entity = 'leads' AND purpose = 'view' AND status = 'active' ORDER BY is_default DESC, id ASC LIMIT 1"
  );
  if (forms.length === 0) return { sections: [], fieldMap: {} };
  const lc = parseLayout(forms[0].layout_config);
  const sections = (lc && lc.sections) || [];
  const secMap = {};
  sections.forEach((s) => { if (s && s.id) secMap[s.id] = s; });
  const rowToSec = {};
  sections.forEach((s) => {
    if (!s) return;
    if (s.type === 'tabs' || Array.isArray(s.tabs)) {
      (s.tabs || []).forEach((t) => {
        (t.sectionRefs || []).forEach((id) => {
          const rs = secMap[id];
          if (rs) (rs.rows || []).forEach((r) => { rowToSec[r.id] = rs; });
        });
      });
    } else {
      (s.rows || []).forEach((r) => { rowToSec[r.id] = s; });
    }
  });
  const [ff] = await conn.query(
    `SELECT fd.\`key\` AS fkey, ff.config
       FROM form_fields ff
       JOIN field_definitions fd ON fd.id = ff.field_id
      WHERE ff.form_id = ?`,
    [forms[0].id]
  );
  const fieldMap = {};
  ff.forEach((row) => {
    let cfg = row.config;
    if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { cfg = {}; } }
    const rid = cfg && cfg.rowId;
    if (rid !== undefined && rid !== null && rowToSec[rid]) fieldMap[row.fkey] = rowToSec[rid];
  });
  return { sections, fieldMap };
};

const CSKH_ROLES = ['MKT', 'ADMIN', 'SUPER_ADMIN'];
const TVBH_ROLES = ['SALES', 'ADMIN', 'SUPER_ADMIN'];
const CSKH_KEYS = ['cskh_history', 'cskh_note'];
const TVBH_KEYS = ['tvbh_history', 'tvbh_note', 'sales_outcome'];

const keyKind = (key) => {
  if (CSKH_KEYS.includes(key)) return 'cskh';
  if (TVBH_KEYS.includes(key)) return 'tvbh';
  return null;
};

const defaultEditDenied = (kind, role) => {
  if (kind === 'cskh' && !CSKH_ROLES.includes(role)) {
    return 'Chỉ MKT, ADMIN, SUPER_ADMIN được sửa Thông tin Marketing và Chăm sóc khách hàng';
  }
  if (kind === 'tvbh' && !TVBH_ROLES.includes(role)) {
    return 'Chỉ SALES, ADMIN, SUPER_ADMIN được sửa Tư vấn bán hàng (TVBH)';
  }
  return null;
};

exports.enforceLeadEdit = async (user, data, conn = pool, before = null) => {
  const touched = Object.keys(data || {}).filter((k) => data[k] !== undefined);
  if (touched.length === 0) return;
  const changed = before
    ? touched.filter((k) => !sameValue(data[k], currentOf(before, k)))
    : touched;
  if (changed.length === 0) return;
  const ctx = await getUserCtx(user, conn);
  let fieldMap = {};
  try {
    ({ fieldMap } = await getLeadFormFieldSections(conn));
  } catch { fieldMap = {}; }
  for (const key of changed) {
    const section = fieldMap[key];
    if (section) {
      const p = getSectionPerms(section);
      if (p.hasEdit) {
        if (!matchRule(p.edit, ctx)) {
          const err = new Error(`Không có quyền sửa mục "${section.title || key}" (section giới hạn theo vai trò/phòng ban/chức vụ/user)`);
          err.statusCode = 403;
          throw err;
        }
        continue;
      }
    }
    const kind = section ? sectionKind(section.title) : null;
    const denied = defaultEditDenied(kind || keyKind(key), ctx.role);
    if (denied) {
      const err = new Error(denied);
      err.statusCode = 403;
      throw err;
    }
  }
};

const ALWAYS_VISIBLE = new Set(['id', 'journey_id', 'lead_code', 'stage', 'created_by', 'created_at', 'updated_at', 'deleted_at']);

exports.stripLeadView = async (record, user, conn = pool) => {
  if (!record || !user) return record;
  const ctx = await getUserCtx(user, conn);
  let fieldMap = {};
  try {
    ({ fieldMap } = await getLeadFormFieldSections(conn));
  } catch { return record; }
  const hidden = Object.keys(fieldMap).filter((key) => {
    if (ALWAYS_VISIBLE.has(key)) return false;
    const p = getSectionPerms(fieldMap[key]);
    return p.hasView && !matchRule(p.view, ctx);
  });
  if (hidden.length === 0) return record;
  hidden.forEach((key) => {
    delete record[key];
    if (record.custom_data && typeof record.custom_data === 'object') delete record.custom_data[key];
  });
  return record;
};

exports.getUserCtx = getUserCtx;
exports.matchRule = matchRule;
exports.isRuleEmpty = isRuleEmpty;
