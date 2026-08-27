const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const { requireAuth, requireAdmin } = require('../middlewares/auth');

// GET /api/admin/proposals - Admin get all proposals
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT p.id, p.latitude, p.longitude, p.owner_name, p.owner_phone,
              p.address, p.area, p.land_type, p.description, p.status,
              p.created_at, u.full_name as user_name, u.email as user_email
      FROM station_proposals p
      JOIN users u ON p.user_id = u.id
    `;
    const params = [];

    if (status) {
      query += ' WHERE p.status = ?';
      params.push(status);
    }
    query += ' ORDER BY p.created_at DESC';

    const [proposals] = await pool.query(query, params);
    res.json({ success: true, data: proposals });
  } catch (error) {
    console.error('Admin get proposals error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// DELETE /api/admin/proposals/:id
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT id FROM station_proposals WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }
    await pool.query('DELETE FROM station_proposals WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Xóa đề xuất thành công' });
  } catch (error) {
    console.error('Admin delete proposal error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// PUT /api/admin/proposals/:id/status - Update status
router.put('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['PENDING', 'REVIEWING', 'APPROVED', 'REJECTED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
    }

    const [existing] = await pool.query('SELECT id FROM station_proposals WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }

    await pool.query('UPDATE station_proposals SET status = ? WHERE id = ?', [status, req.params.id]);
    const [proposal] = await pool.query(
      `SELECT p.*, u.full_name as user_name FROM station_proposals p JOIN users u ON p.user_id = u.id WHERE p.id = ?`,
      [req.params.id]
    );
    res.json({ success: true, data: proposal[0], message: 'Cập nhật trạng thái thành công' });
  } catch (error) {
    console.error('Admin update status error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
