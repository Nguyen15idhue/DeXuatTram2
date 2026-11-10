const pool = require('../utils/db');
const access = require('./leadAccessService');

const resolveTab = async (value, user) => {
  const ctx = await access.getContext(user);
  access.assertAccess(ctx);
  const policy = access.tabPolicy(ctx);
  const tab = value === undefined || value === '' ? policy.defaultTab : value;
  const allTabs = ['allocation', 'allocated', 'first-contact', 'consulting', 'completed', 'all'];
  if (!allTabs.includes(tab)) throw Object.assign(new Error('Tab khách hàng không hợp lệ'), { statusCode: 400 });
  if (!policy.tabs.includes(tab)) throw Object.assign(new Error('Không có quyền xem tab khách hàng này'), { statusCode: 403 });
  return { tab, ...policy };
};

const predicates = async () => {
  const [users] = await pool.query('SELECT id, role, custom_data FROM users');
  const directors = [];
  const areas = [];
  for (const user of users) {
    const ctx = access.context(user);
    if (ctx.isGdtt) directors.push(user.id);
    if (ctx.isGdkv) areas.push(user.id);
  }
  const assigned = (ids) => ids.length
    ? { sql: 'l.assigned_user_id IN (?)', params: [ids] } : { sql: '0 = 1', params: [] };
  const gdtt = assigned(directors);
  const gdkv = assigned(areas);
  const status = (assignment, value) => ({
    sql: `(${assignment.sql} AND l.consultation_status = ?)`, params: [...assignment.params, value]
  });
  return {
    allocation: status(gdtt, 'WAITING_ALLOCATION'),
    allocated: gdkv,
    'first-contact': status(gdkv, 'WAITING_FIRST_CONTACT'),
    consulting: status(gdkv, 'CONSULTING'),
    completed: { sql: "l.consultation_status IN ('SUCCESS', 'FAILED')", params: [] },
    all: { sql: '1 = 1', params: [] }
  };
};

const getTabFilter = async (value, user) => {
  const policy = await resolveTab(value, user);
  return { ...policy, condition: (await predicates())[policy.tab] };
};

const getTaskCounts = async (user) => {
  const policy = await resolveTab(undefined, user);
  const conditions = await predicates();
  const scope = await access.buildScope(user);
  const params = [];
  const columns = policy.tabs.map((tab, index) => {
    params.push(...conditions[tab].params);
    return `COALESCE(SUM(CASE WHEN ${conditions[tab].sql} THEN 1 ELSE 0 END), 0) AS count_${index}`;
  });
  if (scope) params.push(...scope.params);
  const [[row]] = await pool.query(
    `SELECT ${columns.join(', ')} FROM leads l ${scope ? `WHERE ${scope.sql}` : ''}`, params);
  const counts = Object.fromEntries(policy.tabs.map((tab, index) => [tab, Number(row[`count_${index}`])]));
  return { counts, total: policy.taskTabs.reduce((sum, tab) => sum + counts[tab], 0),
    tabs: policy.tabs, default_tab: policy.defaultTab };
};

module.exports = { resolveTab, getTabFilter, getTaskCounts };
