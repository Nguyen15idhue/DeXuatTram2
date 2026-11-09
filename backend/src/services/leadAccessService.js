const pool = require('../utils/db');
const { isGdtt, isGdkv } = require('../constants/salesRanks');

const normalize = (value) => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toLowerCase().replace(/\s+/g, ' ').trim();

const context = (user) => {
  let cd = user?.custom_data || {};
  if (typeof cd === 'string') cd = JSON.parse(cd);
  const department = cd.department || '';
  const title = normalize(cd.chuc_vu);
  const dept = normalize(department);
  const isSuper = user?.role === 'SUPER_ADMIN';
  const isTgd = ['tong giam doc', 'tgd'].includes(title);
  const isPlanning = /(?:cong nghe|quan he) va quy hoach/.test(dept);
  const isBusiness = /(?:kinh doanh|trung tam kd).*mien (?:bac|trung|nam)/.test(dept);
  return {
    ...user, department, isSuper, isTgd, isPlanning, isBusiness,
    isGdtt: isBusiness && isGdtt(cd.chuc_vu, department),
    isGdkv: isBusiness && isGdkv(cd.chuc_vu, department),
    canAccess: isSuper || isTgd || isPlanning || isBusiness
  };
};

const getContext = async (user, executor = pool) => {
  if (!user?.id) return context(null);
  const [rows] = await executor.query('SELECT id, role, status, custom_data FROM users WHERE id = ?', [user.id]);
  return rows[0]?.status === 'ACTIVE' ? context(rows[0]) : context(null);
};

const assertAccess = (ctx) => {
  if (!ctx.canAccess) throw Object.assign(new Error('Không có quyền truy cập Quản lý khách hàng'), { statusCode: 403 });
};

const buildScope = async (user, executor = pool, alias = 'l') => {
  const ctx = await getContext(user, executor);
  assertAccess(ctx);
  if (ctx.isSuper || ctx.isTgd || ctx.isPlanning) return null;
  const ids = await require('./adminUserService').getBranchIds(ctx.id);
  const branch = [...new Set([Number(ctx.id), ...ids.map(Number)])];
  if (ctx.isGdtt) {
    return { sql: `(${alias}.assigned_department = ? OR ${alias}.assigned_user_id IN (?))`, params: [ctx.department, branch] };
  }
  return { sql: `${alias}.assigned_user_id IN (?)`, params: [branch] };
};

const permissionResolver = async (user, executor = pool) => {
  const ctx = await getContext(user, executor);
  assertAccess(ctx);
  const global = ctx.isSuper || ctx.isTgd || ctx.isPlanning;
  const ids = global ? [] : await require('./adminUserService').getBranchIds(ctx.id);
  const branch = new Set([Number(ctx.id), ...ids.map(Number)]);
  return (lead) => {
    const inScope = global || branch.has(Number(lead.assigned_user_id))
      || (ctx.isGdtt && lead.assigned_department === ctx.department);
    return {
      can_view: inScope,
      can_consult: inScope && (ctx.isSuper || (!ctx.isTgd && !ctx.isPlanning && (ctx.isGdtt || ctx.isGdkv))),
      can_assign: inScope && (ctx.isSuper || (!ctx.isTgd && !ctx.isPlanning && ctx.isGdtt)),
      can_write_general: ctx.isSuper
    };
  };
};

const permissions = async (lead, user, executor = pool) => (await permissionResolver(user, executor))(lead);

const tabPolicy = (ctx) => {
  if (ctx.isSuper || ctx.isTgd || ctx.isPlanning) {
    return { tabs: ['allocation', 'allocated', 'first-contact', 'consulting', 'completed', 'all'],
      defaultTab: 'all', taskTabs: ['allocation', 'first-contact', 'consulting'] };
  }
  if (ctx.isGdtt) return { tabs: ['allocation', 'allocated', 'all'], defaultTab: 'allocation', taskTabs: ['allocation'] };
  if (ctx.isGdkv) return { tabs: ['first-contact', 'consulting', 'completed', 'all'],
    defaultTab: 'first-contact', taskTabs: ['first-contact', 'consulting'] };
  return { tabs: ['all'], defaultTab: 'all', taskTabs: [] };
};

module.exports = { normalize, context, getContext, assertAccess, buildScope, permissions, permissionResolver, tabPolicy };
