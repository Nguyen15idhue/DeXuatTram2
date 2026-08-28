const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const { requireAuth } = require('../middlewares/auth');

// GET /api/my-proposals - User get own proposals
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT p.id, p.latitude, p.longitude, p.owner_name, p.owner_phone,
              p.address, p.area, p.land_type, p.description, p.status,
              p.created_at
      FROM station_proposals p
      WHERE p.user_id = ?
    `;
    const params = [req.user.id];

    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }
    query += ' ORDER BY p.created_at DESC';

    const [proposals] = await pool.query(query, params);
    res.json({ success: true, data: proposals });
  } catch (error) {
    console.error('Get my proposals error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// PUT /api/my-proposals/:id - User update own proposal (only PENDING status)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { owner_name, owner_phone, address, area, land_type, description } = req.body;

    if (!owner_name || !owner_phone || !address) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ thông tin bắt buộc' });
    }

    const [existing] = await pool.query(
      'SELECT id, status FROM station_proposals WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }

    if (existing[0].status !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'Chỉ có thể chỉnh sửa đề xuất đang ở trạng thái PENDING' });
    }

    await pool.query(
      `UPDATE station_proposals 
       SET owner_name = ?, owner_phone = ?, address = ?, area = ?, land_type = ?, description = ?
       WHERE id = ? AND user_id = ?`,
      [owner_name, owner_phone, address, area || '', land_type || '', description || '', id, req.user.id]
    );

    const [proposal] = await pool.query(
      'SELECT * FROM station_proposals WHERE id = ?',
      [id]
    );

    res.json({ success: true, data: proposal[0], message: 'Cập nhật đề xuất thành công' });
  } catch (error) {
    console.error('Update my proposal error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
