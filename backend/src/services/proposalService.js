const pool = require('../utils/db');
const dynamicUtils = require('./dynamicUtils');
const dynamicEngineService = require('./dynamicEngineService');

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

exports.createProposal = async (userId, data) => {
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity('station_proposals');
  const { fixedData, dynamicData } = dynamicUtils.splitData('station_proposals', data, fieldDefs);

  const customData = Object.keys(dynamicData).length > 0 ? JSON.stringify(dynamicData) : null;

  const [result] = await pool.query(
    `INSERT INTO station_proposals (user_id, latitude, longitude, owner_name, owner_phone, address, area, land_type, description, custom_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, fixedData.latitude, fixedData.longitude, fixedData.owner_name, fixedData.owner_phone, fixedData.address || '', fixedData.area || '', fixedData.land_type || '', fixedData.description || '', customData]
  );

  const recordId = result.insertId;

  const postResults = await dynamicEngineService.computePostFormulas('station_proposals', recordId, dynamicData, userId, null);
  if (Object.keys(postResults).length > 0) {
    const updatedDynamic = { ...dynamicData, ...postResults };
    const updatedCustomData = JSON.stringify(updatedDynamic);
    await pool.query('UPDATE station_proposals SET custom_data = ? WHERE id = ?', [updatedCustomData, recordId]);
  }

  const [proposal] = await pool.query(
    `SELECT p.*, u.full_name as user_name
     FROM station_proposals p
     JOIN users u ON p.user_id = u.id
     WHERE p.id = ?`,
    [recordId]
  );

  const finalData = dynamicUtils.mergeData(proposal[0], fieldDefs);
  if (Object.keys(postResults).length > 0) {
    Object.assign(finalData, postResults);
  }
  return finalData;
};
