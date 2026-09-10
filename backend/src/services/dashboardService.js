const pool = require('../utils/db');

exports.getDashboardStats = async (scope = {}) => {
  const isSales = scope.role === 'SALES' && scope.userId;
  let branchIds = null;
  if (isSales) {
    const [rows] = await pool.query('SELECT id FROM users WHERE id = ? OR parent_id = ?', [scope.userId, scope.userId]);
    branchIds = rows.map(r => r.id);
  }
  const inBranch = (col) => branchIds ? ` AND ${col} IN (${branchIds.map(() => '?').join(',')})` : '';
  const branchParams = () => branchIds ? [...branchIds] : [];

  const [[{ totalUsers }]] = await pool.query(
    `SELECT COUNT(*) as totalUsers FROM users WHERE 1=1${isSales ? ` AND (id IN (${branchIds.map(() => '?').join(',')}))` : ''}`,
    isSales ? [...branchIds] : []
  );
  let totalStations = null;
  let activeStations = null;
  let deployingStations = null;
  if (!isSales) {
    [[{ totalStations }]] = await pool.query('SELECT COUNT(*) as totalStations FROM stations');
  }
  const [[{ totalProposals }]] = await pool.query(
    `SELECT COUNT(*) as totalProposals FROM station_proposals WHERE 1=1${inBranch('user_id')}`,
    branchParams()
  );

  if (!isSales) {
    [[{ activeStations }]] = await pool.query("SELECT COUNT(*) as activeStations FROM stations WHERE status = 'ACTIVE'");
    [[{ deployingStations }]] = await pool.query("SELECT COUNT(*) as deployingStations FROM stations WHERE status = 'DEPLOYING'");
  }

  const [[{ pendingProposals }]] = await pool.query(
    `SELECT COUNT(*) as pendingProposals FROM station_proposals WHERE status = 'PENDING'${inBranch('user_id')}`,
    branchParams()
  );
  const [[{ approvedProposals }]] = await pool.query(
    `SELECT COUNT(*) as approvedProposals FROM station_proposals WHERE status = 'APPROVED'${inBranch('user_id')}`,
    branchParams()
  );
  const [[{ rejectedProposals }]] = await pool.query(
    `SELECT COUNT(*) as rejectedProposals FROM station_proposals WHERE status = 'REJECTED'${inBranch('user_id')}`,
    branchParams()
  );

  const [[{ newProposals7d }]] = await pool.query(
    `SELECT COUNT(*) as newProposals7d FROM station_proposals WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)${inBranch('user_id')}`,
    branchParams()
  );

  const [[{ approvalRate }]] = await pool.query(
    `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved FROM station_proposals WHERE 1=1${inBranch('user_id')}`,
    branchParams()
  );

  const userScope = isSales ? ` AND (id IN (${branchIds.map(() => '?').join(',')}))` : '';
  const [[{ activeUsers }]] = await pool.query(
    `SELECT COUNT(*) as activeUsers FROM users WHERE status = 'ACTIVE'${userScope}`,
    isSales ? [...branchIds] : []
  );
  const [[{ lockedUsers }]] = await pool.query(
    `SELECT COUNT(*) as lockedUsers FROM users WHERE status = 'LOCKED'${userScope}`,
    isSales ? [...branchIds] : []
  );

  return {
    scope: isSales ? 'branch' : 'all',
    users: { total: totalUsers, active: activeUsers, locked: lockedUsers },
    stations: isSales ? null : { total: totalStations, active: activeStations, deploying: deployingStations },
    proposals: {
      total: totalProposals, pending: pendingProposals, approved: approvedProposals,
      rejected: rejectedProposals, new7d: newProposals7d,
      approvalRate: totalProposals > 0 ? Math.round((approvedProposals / totalProposals) * 100) : 0
    }
  };
};
