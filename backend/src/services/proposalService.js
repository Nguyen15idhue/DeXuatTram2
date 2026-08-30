const pool = require('../utils/db');

exports.getAllProposals = async () => {
  const [proposals] = await pool.query(
    `SELECT p.id, p.latitude, p.longitude, p.owner_name, p.owner_phone,
            p.address, p.area, p.land_type, p.description, p.status,
            p.created_at, u.full_name as user_name
     FROM station_proposals p
     JOIN users u ON p.user_id = u.id
     ORDER BY p.created_at DESC`
  );
  return proposals;
};

exports.getProposalById = async (id) => {
  const [proposals] = await pool.query(
    `SELECT p.*, u.full_name as user_name
     FROM station_proposals p
     JOIN users u ON p.user_id = u.id
     WHERE p.id = ?`,
    [id]
  );
  return proposals.length > 0 ? proposals[0] : null;
};

exports.createProposal = async (userId, latitude, longitude, ownerName, ownerPhone, address, area, landType, description) => {
  const [result] = await pool.query(
    `INSERT INTO station_proposals (user_id, latitude, longitude, owner_name, owner_phone, address, area, land_type, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, latitude, longitude, ownerName, ownerPhone, address, area || '', landType || '', description || '']
  );

  const [proposal] = await pool.query(
    `SELECT p.*, u.full_name as user_name
     FROM station_proposals p
     JOIN users u ON p.user_id = u.id
     WHERE p.id = ?`,
    [result.insertId]
  );
  return proposal[0];
};
