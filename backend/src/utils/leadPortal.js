const configuredId = String(process.env.LEAD_PORTAL_USER_ID || '').trim();
if (configuredId && !/^[1-9]\d*$/.test(configuredId)) {
  throw new Error('LEAD_PORTAL_USER_ID must be a positive user ID');
}

const isLeadPortalId = (id) => !!configuredId && String(id) === configuredId;
const isLeadPortalUser = (user) => user?.role === 'MKT'
  && (user.status === undefined || user.status === 'ACTIVE') && isLeadPortalId(user.id);
const canManageAllLeads = (user) => user?.role === 'SUPER_ADMIN' || isLeadPortalUser(user);

module.exports = { isLeadPortalId, isLeadPortalUser, canManageAllLeads };
