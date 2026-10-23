const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const deptOf = (user) => normalizeText(user?.department);
const titleOf = (user) => normalizeText(user?.chuc_vu);

export const isAdminUser = (user) => ['SUPER_ADMIN', 'ADMIN'].includes(user?.role);

export const isLayoutDept = (user) => {
  const dept = deptOf(user);
  return dept.includes('cong nghe') || dept.includes('quy hoach') || dept.includes('quan he');
};

export const isStrategyDept = (user) => deptOf(user).includes('chien luoc');

export const isBackOfficeDept = (user) => {
  const department = deptOf(user);
  return department.includes('back office') || department.includes('backoffice');
};

export const isGdttkdUser = (user) => {
  const title = titleOf(user);
  const dept = deptOf(user);
  return title.includes('giam doc trung tam kinh doanh')
    || dept.includes('trung tam kd')
    || dept.includes('trung tam kinh doanh');
};

export const isTgdUser = (user) => {
  const title = titleOf(user);
  if (title.includes('pho tong giam doc')) return false;
  return title.includes('tong giam doc') || deptOf(user).includes('tong giam doc');
};

export const isReviewUser = (user) => (
  isGdttkdUser(user) || isLayoutDept(user) || isStrategyDept(user) || isTgdUser(user)
);

export const canSeeReviewRequestsPage = (user) => isAdminUser(user) || isReviewUser(user);

export const canSeeLayoutPage = (user) => isAdminUser(user) || isLayoutDept(user);

export const canSeeApprovalPage = (user) => (
  user?.role === 'SUPER_ADMIN'
  || (user?.role === 'ADMIN' && isBackOfficeDept(user))
);
