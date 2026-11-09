export const LEAD_CSKH_KEYS = ['cskh_history', 'cskh_note'];
export const LEAD_TVBH_KEYS = ['tvbh_history', 'tvbh_note', 'sales_outcome', 'consultation_status'];

export const LEAD_CSKH_ROLES = ['SUPER_ADMIN'];
export const LEAD_TVBH_ROLES = ['SUPER_ADMIN'];

export { SECTION_PERM_ROLES } from './formSectionPerms';
import { canViewSection, userCtxFromAuthUser } from './formSectionPerms';
import { canAccessCustomers, isLeadCeo, isLeadPlanning, isLeadBusinessCenter } from './leadAccess';

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
  return role === 'SUPER_ADMIN' ? null : 'tvbh';
};

export const leadSectionNotice = (role) => {
  if (role !== 'SUPER_ADMIN') return 'Chỉ được cập nhật thông tin tư vấn trong phạm vi được phân quyền. Thông tin chung và CSKH chỉ dành cho Super Admin.';
  return '';
};

export const canViewLeadSection = (section, user) => {
  const ctx = (user && typeof user === 'object' && ('role' in user || 'id' in user))
    ? userCtxFromAuthUser(user) : { role: user, id: null, department: '', chuc_vu: '' };
  if (getLeadSectionKind(section?.title) === 'tvbh' && canAccessCustomers(user)) return true;
  return canViewSection(section, ctx);
};

export const canEditLeadSection = (section, user) => {
  const ctx = (user && typeof user === 'object' && ('role' in user || 'id' in user))
    ? userCtxFromAuthUser(user) : { role: user, id: null, department: '', chuc_vu: '' };
  if (ctx.role === 'SUPER_ADMIN') return true;
  if (!canAccessCustomers(user) || (isLeadPlanning(user) && !isLeadCeo(user))) return false;
  const kind = getLeadSectionKind(section && section.title);
  if (kind !== 'tvbh' || (!isLeadCeo(user) && !isLeadBusinessCenter(user))) return false;
  return true;
};

export const leadFieldSectionKind = (fieldKey) => {
  if (LEAD_CSKH_KEYS.includes(fieldKey)) return 'cskh';
  if (LEAD_TVBH_KEYS.includes(fieldKey)) return 'tvbh';
  return null;
};
