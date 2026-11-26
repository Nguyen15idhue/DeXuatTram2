const pool = require('../utils/db');
const { isGdkv, isGdtt } = require('../constants/salesRanks');

const parseCustom = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  return JSON.parse(value);
};

const loadUsers = async (connection = pool) => {
  const [rows] = await connection.query('SELECT id, parent_id, role, status, custom_data FROM users');
  return rows;
};

const eligibleManagerIdsFromMap = (ownerId, byId) => {
  const owner = byId.get(Number(ownerId));
  if (!owner || !['CTV', 'NPP'].includes(owner.role)) return [];
  const seen = new Set([Number(owner.id)]);
  const eligible = [];
  let next = Number(owner.parent_id);
  let atManagementLevel = false;
  while (next && !seen.has(next)) {
    seen.add(next);
    const user = byId.get(next);
    if (!user) break;
    const custom = parseCustom(user.custom_data);
    if (['SALES', 'ADMIN'].includes(user.role)
      && (isGdkv(custom.chuc_vu, custom.department) || isGdtt(custom.chuc_vu, custom.department))) {
      atManagementLevel = true;
    }
    if (atManagementLevel && user.status === 'ACTIVE' && ['SALES', 'ADMIN'].includes(user.role)) {
      eligible.push(Number(user.id));
    }
    next = Number(user.parent_id);
  }
  return eligible;
};

const eligibleManagerIds = (ownerId, users) => eligibleManagerIdsFromMap(
  ownerId, new Map(users.map((user) => [Number(user.id), user]))
);

const canApproveFromMap = (ownerId, actor, byId) => {
  const owner = byId.get(Number(ownerId));
  const currentActor = byId.get(Number(actor?.id));
  if (!owner || !['CTV', 'NPP'].includes(owner.role) || !currentActor
    || currentActor.status !== 'ACTIVE' || Number(owner.id) === Number(currentActor.id)) return false;
  if (currentActor.role === 'SUPER_ADMIN') return true;
  const managers = eligibleManagerIdsFromMap(ownerId, byId);
  return managers.includes(Number(currentActor.id))
    || (currentActor.role === 'ADMIN' && managers.length === 0);
};

const canApprove = (ownerId, actor, users) => canApproveFromMap(
  ownerId, actor, new Map(users.map((user) => [Number(user.id), user]))
);

const approvableOwnerIds = (actor, users) => {
  const byId = new Map(users.map((user) => [Number(user.id), user]));
  return users.filter((user) => ['CTV', 'NPP'].includes(user.role) && canApproveFromMap(user.id, actor, byId))
    .map((user) => Number(user.id));
};

const preparePending = async (proposalId, actorId = null, actorRole = null, ip = null) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM station_proposals WHERE id = ? FOR UPDATE', [proposalId]);
    const proposal = rows[0];
    if (!proposal || proposal.status !== 'PENDING') {
      await connection.commit();
      return { skipped: 'not_pending' };
    }
    const users = await loadUsers(connection);
    const owner = users.find((user) => Number(user.id) === Number(proposal.user_id));
    const check = await require('./proposalEntryReadiness').check(proposal, connection);
    if (!check.complete || !['CTV', 'NPP'].includes(owner?.role)) {
      await connection.query(
        "UPDATE proposal_requests SET status = 'CANCELLED', resolved_by = ?, resolved_at = NOW() WHERE proposal_id = ? AND request_type = 'ENTRY_APPROVAL' AND status = 'OPEN'",
        [actorId || null, proposalId]
      );
      if (!check.complete && proposal.info_completed_at) {
        await connection.query('UPDATE station_proposals SET info_completed_at = NULL WHERE id = ?', [proposalId]);
      }
      await connection.commit();
      return { ...check, requiresApproval: false };
    }
    await connection.query('UPDATE station_proposals SET info_completed_at = COALESCE(info_completed_at, NOW()) WHERE id = ?', [proposalId]);
    if (!proposal.info_completed_at) {
      await require('./proposalLifecycle').logActivity({
        proposalId, action: 'info_completed', fromStatus: 'PENDING', toStatus: 'PENDING',
        actorId, actorRole, source: 'system_auto', ip, connection
      });
    }
    const [inserted] = await connection.query(
      `INSERT INTO proposal_requests
        (proposal_id, request_type, description, requested_by, previous_status, current_status, round_no, status)
       SELECT ?, 'ENTRY_APPROVAL', 'Duyệt đề xuất để chuyển sang chấm điểm', ?, 'PENDING', 'PENDING',
              (SELECT COUNT(*) + 1 FROM proposal_requests r WHERE r.proposal_id = ? AND r.request_type = 'ENTRY_APPROVAL'), 'OPEN'
        WHERE NOT EXISTS (SELECT 1 FROM proposal_requests r WHERE r.proposal_id = ? AND r.request_type = 'ENTRY_APPROVAL' AND r.status = 'OPEN')`,
      [proposalId, actorId || null, proposalId, proposalId]
    );
    await connection.query(
      "UPDATE proposal_requests SET status = 'DONE', resolved_by = ?, resolved_at = NOW() WHERE proposal_id = ? AND request_type IN ('UPDATE_INFO', 'SUPPLEMENT') AND status = 'OPEN'",
      [actorId || null, proposalId]
    );
    await connection.commit();
    return { ...check, requiresApproval: true, createdTask: inserted.affectedRows === 1, proposal };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const reopenPending = async (proposalId, { actorId = null, actorRole = null, source = 'user', ip = null } = {}) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT id, user_id, status, custom_data, info_completed_at FROM station_proposals WHERE id = ? FOR UPDATE', [proposalId]);
    if (!rows.length || rows[0].status !== 'PENDING') {
      throw Object.assign(new Error('Trạng thái đề xuất vừa thay đổi; hãy tải lại'), { statusCode: 409 });
    }
    await connection.query(
      "UPDATE proposal_requests SET status = 'CANCELLED', resolved_by = ?, resolved_at = NOW() WHERE proposal_id = ? AND request_type = 'ENTRY_APPROVAL' AND status = 'OPEN'",
      [actorId, proposalId]
    );
    if (rows[0].info_completed_at) {
      await connection.query('UPDATE station_proposals SET info_completed_at = NULL, updated_at = NOW() WHERE id = ?', [proposalId]);
      if (Number(actorId) !== Number(rows[0].user_id)) {
        await connection.query(
          `INSERT INTO proposal_requests
            (proposal_id, request_type, description, requested_by, previous_status, current_status, target_user_id, round_no, status)
           SELECT ?, 'UPDATE_INFO', 'Yêu cầu mở lại để bổ sung thông tin', ?, 'PENDING', 'PENDING', ?,
                  (SELECT COUNT(*) + 1 FROM proposal_requests r WHERE r.proposal_id = ? AND r.request_type = 'UPDATE_INFO'), 'OPEN'`,
          [proposalId, actorId, rows[0].user_id, proposalId]
        );
      }
      await require('./proposalLifecycle').logActivity({
        proposalId, action: 'info_reopened', fromStatus: 'PENDING', toStatus: 'PENDING',
        actorId, actorRole, source, ip, connection
      });
    }
    await connection.commit();
    return { id: proposalId, completed: false, unchanged: !rows[0].info_completed_at, proposal: rows[0] };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = { loadUsers, eligibleManagerIds, canApprove, approvableOwnerIds, preparePending, reopenPending };
