const express = require('express');
const router = express.Router();
const pool = require('../utils/db');

// GET /api/proposals - Get all proposals (for map display)
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
    
    res.json({
      success: true,
      data: proposals
    });
  } catch (error) {
    console.error('Get proposals error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi server' 
    });
  }
});

// GET /api/proposals/:id - Get proposal by ID
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
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy đề xuất' 
      });
    }

    res.json({
      success: true,
      data: proposals[0]
    });
  } catch (error) {
    console.error('Get proposal error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi server' 
    });
  }
});

module.exports = router;
