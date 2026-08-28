const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const { requireAuth, requireAdmin } = require('../middlewares/auth');

// GET /api/admin/proposals - Admin get all proposals (with pagination)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = [];
    let params = [];

    if (status) {
      where.push('p.status = ?');
      params.push(status);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const countQuery = `SELECT COUNT(*) as total FROM station_proposals p ${whereClause}`;
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0].total;

    const dataQuery = `
      SELECT p.id, p.latitude, p.longitude, p.owner_name, p.owner_phone,
              p.address, p.area, p.land_type, p.description, p.status,
              p.created_at, u.full_name as user_name, u.email as user_email
      FROM station_proposals p
      JOIN users u ON p.user_id = u.id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const [proposals] = await pool.query(dataQuery, [...params, parseInt(limit), offset]);

    res.json({
      success: true,
      data: proposals,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
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
