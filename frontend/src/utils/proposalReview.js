import { resolveGradingRole } from './proposalGrading';

export const REVIEW_ROLE = {
  GDTTKD: 'GDTTKD',
  QH: 'QH',
  PL: 'PL',
  TGD: 'TGD',
  ADMIN: 'ADMIN'
};

export const REVIEW_ROLE_LABELS = {
  GDTTKD: 'Giám đốc Trung tâm Kinh doanh',
  QH: 'Phòng Quy hoạch',
  PL: 'Phòng Pháp lý',
  TGD: 'Tổng Giám đốc',
  ADMIN: 'Quản trị'
};

export const REVIEW_LEVEL_LABELS = {
  1: 'GĐTTKD xem xét',
  2: 'Quy hoạch và Pháp lý chấm lại',
  3: 'Tổng Giám đốc xem xét'
};

export const REGION_LABELS = {
  Bac: 'Miền Bắc',
  Trung: 'Miền Trung',
  Nam: 'Miền Nam'
};

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

export const resolveRegion = (value) => {
  const text = normalizeText(value);
  if (!text) return null;
  if (text.includes('mien bac') || text === 'bac' || text.endsWith(' bac')) return 'Bac';
  if (text.includes('mien trung') || text === 'trung' || text.endsWith(' trung')) return 'Trung';
  if (text.includes('mien nam') || text === 'nam' || text.endsWith(' nam')) return 'Nam';
  return null;
};

const isTgdTitle = (department, chucVu) => {
  const title = normalizeText(chucVu);
  const dept = normalizeText(department);
  if (title.includes('pho tong giam doc')) return false;
  return title.includes('tong giam doc') || dept.includes('tong giam doc');
};

export const resolveReviewRole = (user) => {
  if (!user) return { roleKey: null, region: null, isAdmin: false };
  if (user.role === 'SUPER_ADMIN') {
    return { roleKey: REVIEW_ROLE.ADMIN, region: null, isAdmin: true, isSuperAdmin: true };
  }
  const department = user.department || user.custom_data?.department || '';
  const chucVu = user.chuc_vu || user.custom_data?.chuc_vu || '';
  if (user.role === 'ADMIN') {
    const isTgdDepartment = normalizeText(department).includes('ban tong giam doc');
    return {
      roleKey: isTgdDepartment ? REVIEW_ROLE.TGD : REVIEW_ROLE.ADMIN,
      region: null,
      isAdmin: true,
      isSuperAdmin: false
    };
  }
  if (isTgdTitle(department, chucVu)) {
    return { roleKey: REVIEW_ROLE.TGD, region: null, isAdmin: false };
  }
  const gradingRole = resolveGradingRole(department);
  if (gradingRole) {
    return { roleKey: gradingRole, region: null, isAdmin: false };
  }
  const title = normalizeText(chucVu);
  const dept = normalizeText(department);
  if (title.includes('giam doc trung tam kinh doanh')
    || dept.includes('trung tam kd') || dept.includes('trung tam kinh doanh')) {
    return {
      roleKey: REVIEW_ROLE.GDTTKD,
      region: resolveRegion(department) || resolveRegion(user.custom_data?.vung_mien),
      isAdmin: false
    };
  }
  return { roleKey: null, region: null, isAdmin: false };
};

export const getReviewLevelLabel = (level) => {
  const value = level === null || level === undefined ? null : Number(level);
  if (!value) return '-';
  return REVIEW_LEVEL_LABELS[value] || `Mức ${value}`;
};
