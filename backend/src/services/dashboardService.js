const pool = require('../utils/db');

exports.getDashboardStats = async () => {
  const [[{ totalUsers }]] = await pool.query('SELECT COUNT(*) as totalUsers FROM users');
  const [[{ totalStations }]] = await pool.query('SELECT COUNT(*) as totalStations FROM stations');
  const [[{ totalProposals }]] = await pool.query('SELECT COUNT(*) as totalProposals FROM station_proposals');

  const [[{ activeStations }]] = await pool.query("SELECT COUNT(*) as activeStations FROM stations WHERE status = 'ACTIVE'");
  const [[{ deployingStations }]] = await pool.query("SELECT COUNT(*) as deployingStations FROM stations WHERE status = 'DEPLOYING'");

  const [[{ pendingProposals }]] = await pool.query("SELECT COUNT(*) as pendingProposals FROM station_proposals WHERE status = 'PENDING'");
  const [[{ approvedProposals }]] = await pool.query("SELECT COUNT(*) as approvedProposals FROM station_proposals WHERE status = 'APPROVED'");
  const [[{ rejectedProposals }]] = await pool.query("SELECT COUNT(*) as rejectedProposals FROM station_proposals WHERE status = 'REJECTED'");

  const [[{ activeUsers }]] = await pool.query("SELECT COUNT(*) as activeUsers FROM users WHERE status = 'ACTIVE'");
  const [[{ lockedUsers }]] = await pool.query("SELECT COUNT(*) as lockedUsers FROM users WHERE status = 'LOCKED'");

  return {
    users: { total: totalUsers, active: activeUsers, locked: lockedUsers },
    stations: { total: totalStations, active: activeStations, deploying: deployingStations },
    proposals: { total: totalProposals, pending: pendingProposals, approved: approvedProposals, rejected: rejectedProposals }
  };
};
