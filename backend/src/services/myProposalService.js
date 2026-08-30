const pool = require('../utils/db');

exports.getUserProposals = async (userId, status, page, limit) => {
  const offset = (page - 1) * limit;
  let where = ['p.user_id = ?'];
  let params = [userId];

  if (status) {
    where.push('p.status = ?');
    params.push(status);
  }

  const whereClause = 'WHERE ' + where.join(' AND ');

  const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM station_proposals p ${whereClause}`, params);
  const total = countResult[0].total;

  const [proposals] = await pool.query(
    `SELECT p.id, p.latitude, p.longitude, p.owner_name, p.owner_phone,
            p.address, p.area, p.land_type, p.description, p.status,
            p.created_at
    FROM station_proposals p
    ${whereClause}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    proposals,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

exports.getProposalById = async (id) => {
  const [proposals] = await pool.query('SELECT * FROM station_proposals WHERE id = ?', [id]);
  return proposals.length > 0 ? proposals[0] : null;
};

exports.getProposalByIdAndUser = async (id, userId) => {
  const [existing] = await pool.query(
    'SELECT id, status FROM station_proposals WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  return existing.length > 0 ? existing[0] : null;
};

exports.updateProposal = async (id, userId, ownerName, ownerPhone, address, area, landType, description) => {
  await pool.query(
    `UPDATE station_proposals
     SET owner_name = ?, owner_phone = ?, address = ?, area = ?, land_type = ?, description = ?, updated_at = NOW()
     WHERE id = ? AND user_id = ?`,
    [ownerName, ownerPhone, address, area || '', landType || '', description || '', id, userId]
  );
};

exports.deleteProposal = async (id, userId) => {
  await pool.query('DELETE FROM station_proposals WHERE id = ? AND user_id = ?', [id, userId]);
};
