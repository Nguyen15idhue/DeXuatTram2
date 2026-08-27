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

module.exports = router;
