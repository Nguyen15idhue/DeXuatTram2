import { resolveGradingRole } from './proposalGrading';
import { isGdkv, isGdtt } from './salesRanks';

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
  return !title.includes('pho tong giam doc')
    && title.includes('tong giam doc')
    && dept.includes('ban tong giam doc');
};

export const resolveReviewRole = (user) => {
  if (!user) return { roleKey: null, region: null, isAdmin: false };
  if (user.role === 'SUPER_ADMIN') {
    return { roleKey: REVIEW_ROLE.ADMIN, region: null, isAdmin: true, isSuperAdmin: true };
  }
  const department = user.department || user.custom_data?.department || '';
  const chucVu = user.chuc_vu || user.custom_data?.chuc_vu || '';
  const isAdmin = user.role === 'ADMIN';
  if (['ADMIN', 'SALES'].includes(user.role) && isTgdTitle(department, chucVu)) {
    return { roleKey: REVIEW_ROLE.TGD, region: null, isAdmin };
  }
  if (!['ADMIN', 'SALES'].includes(user.role)) {
    return { roleKey: null, region: null, isAdmin: false };
  }
  const gradingRole = resolveGradingRole(department);
  if (gradingRole) {
    return { roleKey: gradingRole, region: null, isAdmin };
  }
  const title = normalizeText(chucVu);
  const dept = normalizeText(department);
  if (!isGdkv(chucVu, department) && (isGdtt(chucVu, department)
    || title.includes('giam doc trung tam kinh doanh')
    || (!title && (dept.includes('trung tam kd') || dept.includes('trung tam kinh doanh'))))) {
    return {
      roleKey: REVIEW_ROLE.GDTTKD,
      region: resolveRegion(department) || resolveRegion(user.custom_data?.vung_mien),
      isAdmin
    };
  }
  return { roleKey: null, region: null, isAdmin };
};

export const getReviewLevelLabel = (level) => {
  const value = level === null || level === undefined ? null : Number(level);
  if (!value) return '-';
  return REVIEW_LEVEL_LABELS[value] || `Mức ${value}`;
};
