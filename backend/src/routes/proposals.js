const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const { requireAuth } = require('../middlewares/auth');
const { validateCreateProposal } = require('../middlewares/validators');

// GET /api/proposals - Get all proposals (public, for map display)
router.get('/', async (req, res) => {
  try {
    const [proposals] = await pool.query(
      `SELECT p.id, p.latitude, p.longitude, p.owner_name, p.owner_phone, 
              p.address, p.area, p.land_type, p.description, p.status, 
              p.created_at, u.full_name as user_name
       FROM station_proposals p
       JOIN users u ON p.user_id = u.id
       ORDER BY p.created_at DESC`
    );
    res.json({ success: true, data: proposals });
  } catch (error) {
    console.error('Get proposals error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// GET /api/proposals/:id - Get proposal by ID (public)
router.get('/:id', async (req, res) => {
  try {
    const [proposals] = await pool.query(
      `SELECT p.*, u.full_name as user_name
       FROM station_proposals p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = ?`,
      [req.params.id]
    );
    if (proposals.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }
    res.json({ success: true, data: proposals[0] });
  } catch (error) {
    console.error('Get proposal error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// POST /api/proposals - Create proposal (authenticated user)
router.post('/', requireAuth, validateCreateProposal, async (req, res) => {
  try {
    const { latitude, longitude, owner_name, owner_phone, address, area, land_type, description } = req.body;
    const user_id = req.user.id;

    const [result] = await pool.query(
      `INSERT INTO station_proposals (user_id, latitude, longitude, owner_name, owner_phone, address, area, land_type, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, latitude, longitude, owner_name, owner_phone, address, area || '', land_type || '', description || '']
    );

    const [proposal] = await pool.query(
      `SELECT p.*, u.full_name as user_name
       FROM station_proposals p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = ?`,
      [result.insertId]
    );

    res.status(201).json({ success: true, data: proposal[0], message: 'Tạo đề xuất thành công' });
  } catch (error) {
    console.error('Create proposal error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
