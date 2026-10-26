const pool = require('../utils/db');

exports.getProgress = async (proposalId) => {
  const id = Number(proposalId);
  const [requests] = await pool.query(
    `SELECT r.*,
            requester.full_name AS requested_by_name,
            resolver.full_name AS resolved_by_name,
            target.full_name AS target_user_name
       FROM proposal_requests r
       LEFT JOIN users requester ON requester.id = r.requested_by
       LEFT JOIN users resolver ON resolver.id = r.resolved_by
       LEFT JOIN users target ON target.id = r.target_user_id
      WHERE r.proposal_id = ?
      ORDER BY r.created_at ASC, r.id ASC`,
    [id]
  );
  const activity = await require('./proposalActivityService').timeline(id);
  return { requests, activity };
};
