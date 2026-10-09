export const SECTION_PERM_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'MKT', 'CTV', 'NPP'];

const toList = (v) => {
  if (v === undefined || v === null) return [];
  const arr = Array.isArray(v) ? v : String(v).split(',');
  return arr.map((x) => String(x ?? '').trim()).filter(Boolean);
};

export const normalizePermRule = (rule) => {
  const r = (rule && typeof rule === 'object') ? rule : {};
  return {
    roles: toList(r.roles),
    departments: toList(r.departments),
    positions: toList(r.positions || r.chuc_vu),
    user_ids: toList(r.user_ids || r.users).map((x) => String(x).replace(/^#/, '')),
  };
};

export const isPermRuleEmpty = (rule) => {
  const n = normalizePermRule(rule);
  return n.roles.length === 0 && n.departments.length === 0
    && n.positions.length === 0 && n.user_ids.length === 0;
};

const parseCustomData = (v) => {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return {}; }
};

export const userCtxFromAuthUser = (user) => {
  const u = user || {};
  const cd = parseCustomData(u.custom_data);
  return {
    id: u.id ?? null,
    role: u.role || '',
    department: u.department || cd.department || '',
    chuc_vu: u.chuc_vu || cd.chuc_vu || '',
  };
};

const eqFold = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export const matchPermRule = (rule, ctx) => {
  if (isPermRuleEmpty(rule)) return true;
  const n = normalizePermRule(rule);
  const c = ctx || {};
  if (n.roles.length > 0 && n.roles.some((r) => eqFold(r, c.role))) return true;
  if (n.departments.length > 0 && n.departments.some((d) => eqFold(d, c.department))) return true;
  if (n.positions.length > 0 && n.positions.some((p) => eqFold(p, c.chuc_vu))) return true;
  if (n.user_ids.length > 0 && c.id !== null && c.id !== undefined
    && n.user_ids.some((x) => String(x) === String(c.id))) return true;
  return false;
};

export const getSectionPerms = (section) => {
  const p = (section && section.permissions && typeof section.permissions === 'object')
    ? section.permissions : {};
  return {
    hasView: p.view !== undefined && p.view !== null && !isPermRuleEmpty(p.view),
    hasEdit: p.edit !== undefined && p.edit !== null && !isPermRuleEmpty(p.edit),
    view: p.view || null,
    edit: p.edit || null,
  };
};

export const canViewSection = (section, ctx) => {
  const p = getSectionPerms(section);
  if (!p.hasView) return true;
  return matchPermRule(p.view, ctx);
};

export const canEditSectionExplicit = (section, ctx) => {
  const p = getSectionPerms(section);
  if (!p.hasEdit) return null;
  return matchPermRule(p.edit, ctx);
};

export const permRuleSummary = (rule) => {
  if (isPermRuleEmpty(rule)) return 'Mọi người';
  const n = normalizePermRule(rule);
  const parts = [];
  if (n.roles.length > 0) parts.push(`Vai trò: ${n.roles.join(', ')}`);
  if (n.departments.length > 0) parts.push(`Phòng ban: ${n.departments.join(', ')}`);
  if (n.positions.length > 0) parts.push(`Chức vụ: ${n.positions.join(', ')}`);
  if (n.user_ids.length > 0) parts.push(`User: ${n.user_ids.map((x) => `#${x}`).join(', ')}`);
  return parts.join(' · ');
};
