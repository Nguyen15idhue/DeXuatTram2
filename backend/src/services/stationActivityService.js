const pool = require('../utils/db');

exports.logActivity = async ({ stationId, action, fromStatus, toStatus, changedFields, reason, actorId, actorRole, source, manualOverride, ip }) => {
  await pool.query(
    `INSERT INTO station_activity_logs
      (station_id, action, from_status, to_status, changed_fields, reject_reason, actor_id, actor_role, source, manual_override, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      stationId, action,
      fromStatus || null, toStatus || null,
      changedFields ? JSON.stringify(changedFields) : null,
      reason || null, actorId || null, actorRole || null,
      source || 'user', manualOverride ? 1 : 0, ip || null
    ]
  );
};

exports.timeline = async (stationId) => {
  const [rows] = await pool.query(
    `SELECT l.*, u.full_name AS actor_name
     FROM station_activity_logs l
     LEFT JOIN users u ON u.id = l.actor_id
     WHERE l.station_id = ?
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT 200`,
    [stationId]
  );
  return rows;
};
