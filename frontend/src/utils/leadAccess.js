export const normalizeLeadText = (value) => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toLowerCase().replace(/\s+/g, ' ').trim();

const departmentOf = (user) => normalizeLeadText(user?.department || user?.custom_data?.department);
const titleOf = (user) => normalizeLeadText(user?.chuc_vu || user?.custom_data?.chuc_vu);
export const isLeadCeo = (user) => ['tong giam doc', 'tgd'].includes(titleOf(user));
export const isLeadPlanning = (user) => /^(phong )?(cong nghe|quan he) va quy hoach$/.test(departmentOf(user));
export const isLeadBusinessCenter = (user) => /^trung tam (kinh doanh|kd) mien (bac|trung|nam)$/.test(departmentOf(user));
export const isLeadCenterDirector = (user) => isLeadBusinessCenter(user)
  && ['giam doc trung tam kinh doanh', 'giam doc trung tam kd', 'gdttkd'].includes(titleOf(user));
export const isLeadAreaDirector = (user) => ['giam doc khu vuc', 'gdkv'].includes(titleOf(user));
export const canAccessCustomers = (user) => !!user && (user.role === 'SUPER_ADMIN'
  || isLeadCeo(user) || isLeadPlanning(user) || isLeadBusinessCenter(user));
export const canManageBusinessCalendar = (user) => !!user && (user.role === 'SUPER_ADMIN'
  || departmentOf(user).replace(/\s+/g, '').includes('backoffice'));
export const canWriteLeadGeneral = (user, record) => user?.role === 'SUPER_ADMIN'
  && record?.permissions?.can_write_general !== false;
export const canAssignLead = (user, record) => canAccessCustomers(user)
  && (user?.role === 'SUPER_ADMIN' || (!isLeadCeo(user) && !isLeadPlanning(user) && isLeadCenterDirector(user)))
  && record?.permissions?.can_assign !== false;
export const canConsultLead = (user, record) => {
  if (!user) return false;
  if (user.role !== 'SUPER_ADMIN' && (isLeadCeo(user) || isLeadPlanning(user)
    || !isLeadBusinessCenter(user) || (!isLeadCenterDirector(user) && !isLeadAreaDirector(user)))) return false;
  if (typeof record?.permissions?.can_consult === 'boolean') return record.permissions.can_consult;
  if (!canAccessCustomers(user)) return false;
  return user?.role === 'SUPER_ADMIN';
};
export const LEAD_TABS = [
  { key: 'allocation', label: 'Cần phân chia', task: true },
  { key: 'allocated', label: 'Đã phân chia' },
  { key: 'first-contact', label: 'Cần tư vấn lần đầu', task: true },
  { key: 'consulting', label: 'Đang tư vấn', task: true },
  { key: 'completed', label: 'Đã hoàn thành' },
  { key: 'all', label: 'Tất cả' },
];
export const leadTabPolicy = (user) => {
  if (user?.role === 'SUPER_ADMIN' || isLeadCeo(user) || isLeadPlanning(user)) {
    return { tabs: LEAD_TABS, defaultTab: 'all' };
  }
  const keys = isLeadCenterDirector(user) ? ['allocation', 'allocated', 'all']
    : isLeadAreaDirector(user) ? ['first-contact', 'consulting', 'completed', 'all'] : ['all'];
  return { tabs: LEAD_TABS.filter(tab => keys.includes(tab.key)), defaultTab: keys[0] };
};
export const canEditLead = (user, record) => canWriteLeadGeneral(user, record) || canConsultLead(user, record);
export const LEAD_CONSULTATION_OPTIONS = [
  { value: 'WAITING_ALLOCATION', label: 'Chờ GĐTTKD phân bổ' },
  { value: 'WAITING_FIRST_CONTACT', label: 'Chờ GĐKV tư vấn lần đầu' },
  { value: 'CONSULTING', label: 'GĐKV đang tư vấn' },
  { value: 'SUCCESS', label: 'Đã tư vấn thành công' },
  { value: 'FAILED', label: 'Đã tư vấn thất bại' },
];
export const leadConsultationTiming = (record) => {
  if (record?.consultation_status !== 'WAITING_FIRST_CONTACT' || !record.consultation_timing) return null;
  const timing = record.consultation_timing;
  const remaining = timing.remaining_minutes == null ? NaN : Number(timing.remaining_minutes);
  return {
    overdue: !!timing.overdue,
    warning: !timing.overdue && (!!timing.warning || (Number.isFinite(remaining) && remaining <= 60 && remaining >= 0)),
    label: timing.overdue ? 'Quá hạn liên hệ lần đầu'
      : Number.isFinite(remaining) ? `Còn ${Math.max(0, Math.ceil(remaining))} phút làm việc` : '',
  };
};
