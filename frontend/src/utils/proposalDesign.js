import { resolveGradingRole, getLegalDocFiles } from './proposalGrading';

export const LAYOUT_FIELD_KEY = 'ban_ve_layout';

export const LAYOUT_ROLE = {
  ADMIN: 'ADMIN',
  DESIGN: 'DESIGN'
};

export const LAYOUT_MANAGE_STATUSES = ['DESIGNING', 'INFOR_WAITING'];
export const LAYOUT_UPDATE_STATUSES = ['DESIGNING'];

export const resolveDesignRole = (user) => {
  if (!user) return null;
  if (user.role === 'SUPER_ADMIN') return LAYOUT_ROLE.ADMIN;
  return ['ADMIN', 'SALES'].includes(user.role)
    && resolveGradingRole(user.department || user.custom_data?.department) === 'QH' ? LAYOUT_ROLE.DESIGN : null;
};

export const canManageLayout = (user) => !!resolveDesignRole(user);

export const getLayoutFiles = (row) => getLegalDocFiles(row, LAYOUT_FIELD_KEY);

export const getSupplementCount = (row) => {
  const count = Number(row?.supplement_request_count);
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
};

export const canUpdateLayout = (row) => LAYOUT_UPDATE_STATUSES.includes(row?.status);

export const canCancelLayout = (row) => LAYOUT_MANAGE_STATUSES.includes(row?.status);
