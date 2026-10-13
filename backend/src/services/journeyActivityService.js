const pool = require('../utils/db');

exports.log = async (entry, conn = pool) => {
  const [res] = await conn.query(
    `INSERT INTO journey_activity_logs
       (journey_id, entity_type, entity_id, action, stage_before, stage_after,
        status_before, status_after, changed_fields, actor_id, actor_role, source, reason, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.journey_id,
      entry.entity_type || 'lead',
      entry.entity_id,
      entry.action,
      entry.stage_before || null,
      entry.stage_after || null,
      entry.status_before || null,
      entry.status_after || null,
      entry.changed_fields === undefined ? null : JSON.stringify(entry.changed_fields),
      entry.actor_id || null,
      entry.actor_role || null,
      entry.source || 'admin',
      entry.reason || null,
      entry.ip || null,
    ]
  );
  return res.insertId;
};

exports.getTimeline = async (journeyId, limit = 200) => {
  const n = Math.min(500, Math.max(1, parseInt(limit, 10) || 200));
  const [rows] = await pool.query(
    `SELECT l.*, u.full_name AS actor_name
       FROM journey_activity_logs l
       LEFT JOIN users u ON u.id = l.actor_id
      WHERE l.journey_id = ?
      ORDER BY l.created_at ASC, l.id ASC
      LIMIT ?`,
    [journeyId, n]
  );
  return rows;
};

exports.getJourney = async (journeyId, conn = pool) => {
  const [rows] = await conn.query(
    'SELECT * FROM business_journeys WHERE id = ? LIMIT 1',
    [journeyId]
  );
  return rows[0] || null;
};
