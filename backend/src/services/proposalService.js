const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');

exports.getAllProposals = async () => {
  const [proposals] = await pool.query(
    `SELECT p.id, p.latitude, p.longitude, p.owner_name, p.owner_phone,
            p.address, p.area, p.land_type, p.description, p.status,
            p.custom_data, p.created_at, u.full_name as user_name
     FROM station_proposals p
     JOIN users u ON p.user_id = u.id
     ORDER BY p.created_at DESC`
  );

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  return proposals.map(p => dynamicUtils.mergeData(p, fieldDefs));
};

exports.getProposalById = async (id) => {
  const [proposals] = await pool.query(
    `SELECT p.*, u.full_name as user_name
     FROM station_proposals p
     JOIN users u ON p.user_id = u.id
     WHERE p.id = ?`,
    [id]
  );
  if (proposals.length === 0) return null;

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  return dynamicUtils.mergeData(proposals[0], fieldDefs);
};

exports.createProposal = async (userId, latitude, longitude, ownerName, ownerPhone, address, area, landType, description) => {
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const { fixedData, dynamicData } = dynamicUtils.splitData('station_proposals', { latitude, longitude, owner_name: ownerName, owner_phone: ownerPhone, address, area, land_type: landType, description }, fieldDefs);

  const customData = Object.keys(dynamicData).length > 0 ? JSON.stringify(dynamicData) : null;

  const [result] = await pool.query(
    `INSERT INTO station_proposals (user_id, latitude, longitude, owner_name, owner_phone, address, area, land_type, description, custom_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, fixedData.latitude, fixedData.longitude, fixedData.owner_name, fixedData.owner_phone, fixedData.address, fixedData.area || '', fixedData.land_type || '', fixedData.description || '', customData]
  );

  const [proposal] = await pool.query(
    `SELECT p.*, u.full_name as user_name
     FROM station_proposals p
     JOIN users u ON p.user_id = u.id
     WHERE p.id = ?`,
    [result.insertId]
  );
  return dynamicUtils.mergeData(proposal[0], fieldDefs);
};
