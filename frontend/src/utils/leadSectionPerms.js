export const LEAD_CSKH_KEYS = ['cskh_history', 'cskh_note'];
export const LEAD_TVBH_KEYS = ['tvbh_history', 'tvbh_note', 'sales_outcome'];

export const LEAD_CSKH_ROLES = ['MKT', 'ADMIN', 'SUPER_ADMIN'];
export const LEAD_TVBH_ROLES = ['SALES', 'ADMIN', 'SUPER_ADMIN'];

export { SECTION_PERM_ROLES } from './formSectionPerms';
import { canViewSection, canEditSectionExplicit, userCtxFromAuthUser } from './formSectionPerms';

const norm = (s) => String(s || '').toLowerCase();

export const getLeadSectionKind = (title) => {
  const t = norm(title);
  if (!t) return null;
  if (t.includes('tvbh') || t.includes('tư vấn bán hàng') || t.includes('tu van ban hang')) return 'tvbh';
  if (t.includes('cskh') || t.includes('chăm sóc') || t.includes('cham soc')) return 'cskh';
  if (t.includes('marketing')) return 'marketing';
  return null;
};

export const leadReadOnlyKeysForRole = (role) => {
  const locked = [];
  if (!LEAD_CSKH_ROLES.includes(role)) locked.push(...LEAD_CSKH_KEYS);
  if (!LEAD_TVBH_ROLES.includes(role)) locked.push(...LEAD_TVBH_KEYS);
  return locked;
};

export const leadFocusSectionForRole = (role) => {
  if (role === 'MKT') return 'marketing';
  if (role === 'SALES') return 'tvbh';
  return null;
};

export const leadSectionNotice = (role) => {
  if (role === 'MKT') return 'Vai trò MKT chỉ được sửa section Thông tin Marketing và Chăm sóc khách hàng (CSKH).';
  if (role === 'SALES') return 'Vai trò SALES chỉ được sửa section Tư vấn bán hàng (TVBH).';
  return '';
};

const defaultEditRolesForKind = (kind) => {
  if (kind === 'cskh') return LEAD_CSKH_ROLES;
  if (kind === 'tvbh') return LEAD_TVBH_ROLES;
  return null;
};

export const canViewLeadSection = (section, user) => {
  const ctx = (user && typeof user === 'object' && ('role' in user || 'id' in user))
    ? userCtxFromAuthUser(user) : { role: user, id: null, department: '', chuc_vu: '' };
  return canViewSection(section, ctx);
};

export const canEditLeadSection = (section, user) => {
  const ctx = (user && typeof user === 'object' && ('role' in user || 'id' in user))
    ? userCtxFromAuthUser(user) : { role: user, id: null, department: '', chuc_vu: '' };
  const explicit = canEditSectionExplicit(section, ctx);
  if (explicit !== null) return explicit;
  const kind = getLeadSectionKind(section && section.title);
  const roles = defaultEditRolesForKind(kind);
  if (!roles) return true;
  return roles.includes(ctx.role);
};

export const leadFieldSectionKind = (fieldKey) => {
  if (LEAD_CSKH_KEYS.includes(fieldKey)) return 'cskh';
  if (LEAD_TVBH_KEYS.includes(fieldKey)) return 'tvbh';
  return null;
};
