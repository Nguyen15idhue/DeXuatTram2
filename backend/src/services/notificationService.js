const pool = require('../utils/db');

const RETENTION_DAYS = Number(process.env.NOTIFICATION_RETENTION_DAYS) || 7;
const RETENTION_WHERE = `created_at >= DATE_SUB(NOW(), INTERVAL ${RETENTION_DAYS} DAY)`;

const STATUS_TITLES = {
  PENDING: 'Đề xuất chờ duyệt',
  REVIEWING: 'Đề xuất đang được xem xét',
  APPROVED: 'Đề xuất đã được duyệt',
  REJECTED: 'Đề xuất bị từ chối',
  RESUBMITTED: 'Đề xuất được gửi lại',
  CANCELLED: 'Đề xuất đã bị hủy',
  CONTRACT_SIGNED: 'Đề xuất ký hợp đồng thành công',
  CONTRACT_FAILED: 'Đề xuất ký hợp đồng thất bại',
  ARCHIVED: 'Đề xuất đã được lưu trữ',
  PRINCIPLE_APPROVED: 'Đề xuất đã được duyệt chủ trương',
  SUPPLEMENT_EXPIRING: 'Đề xuất sắp hết hạn bổ sung thông tin',
  SUPPLEMENT_OVERDUE: 'Đề xuất đã quá hạn bổ sung thông tin'
};

exports.statusTitle = (status) => STATUS_TITLES[status] || 'Cập nhật đề xuất';

exports.create = async ({ userId, type, title, message, entityType, entityId, createdBy }) => {
  if (!userId) return null;
  const [result] = await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id, is_read, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [userId, type, title || exports.statusTitle(type), message || null, entityType || null, entityId || null, createdBy || null]
  );
  return result.insertId;
};

exports.listByUser = async (userId, page = 1, limit = 20) => {
  const offset = (Math.max(1, page) - 1) * limit;
  const [rows] = await pool.query(
    `SELECT id, type, title, message, entity_type, entity_id, is_read, created_at, read_at
     FROM notifications WHERE user_id = ? AND ${RETENTION_WHERE}
     ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND ${RETENTION_WHERE}`,
    [userId]
  );
  return { items: rows, total: countRows[0].total };
};

exports.unreadCount = async (userId) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0 AND ${RETENTION_WHERE}`,
    [userId]
  );
  return rows[0].total;
};

exports.listAll = async (page = 1, limit = 20) => {
  const offset = (Math.max(1, page) - 1) * limit;
  const retention = `n.created_at >= DATE_SUB(NOW(), INTERVAL ${RETENTION_DAYS} DAY)`;
  const [rows] = await pool.query(
    `SELECT n.id, n.user_id, u.full_name AS user_name, n.type, n.title, n.message,
            n.entity_type, n.entity_id, n.is_read, n.created_at
     FROM notifications n LEFT JOIN users u ON u.id = n.user_id
     WHERE ${retention}
     ORDER BY n.created_at DESC, n.id DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM notifications n WHERE ${retention}`);
  return { items: rows, total: countRows[0].total };
};

exports.markRead = async (userId, id) => {
  await pool.query(
    'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ? AND is_read = 0',
    [id, userId]
  );
};

exports.markAllRead = async (userId) => {
  await pool.query(
    'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0',
    [userId]
  );
};

exports.notifyExternal = async (event, payload) => {
  try {
    const [rows] = await pool.query("SELECT `value` FROM proposal_lifecycle_configs WHERE `key` = 'supplement_webhook_url' LIMIT 1");
    const url = String((rows[0] || {}).value || '').trim();
    if (!url) return { sent: false, reason: 'empty webhook_url' };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, ...(payload || {}), at: new Date().toISOString() }),
        signal: ctrl.signal
      });
      return { sent: true, status: res.status };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    return { sent: false, reason: e.message || 'webhook error' };
  }
};

exports.removeByEntity = async (entityType, entityId) => {
  await pool.query('DELETE FROM notifications WHERE entity_type = ? AND entity_id = ?', [entityType, entityId]);
};
