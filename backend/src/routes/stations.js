const express = require('express');
const router = express.Router();
const pool = require('../utils/db');

// GET /api/stations - Get all stations
router.get('/', async (req, res) => {
  try {
    const [stations] = await pool.query(
      'SELECT id, name, latitude, longitude, address, status, description, created_at FROM stations ORDER BY created_at DESC'
    );
    
    res.json({
      success: true,
      data: stations
    });
  } catch (error) {
    console.error('Get stations error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi server' 
    });
  }
});

// GET /api/stations/:id - Get station by ID
router.get('/:id', async (req, res) => {
  try {
    const [stations] = await pool.query(
      'SELECT * FROM stations WHERE id = ?',
      [req.params.id]
    );

    if (stations.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy trạm' 
      });
    }

    res.json({
      success: true,
      data: stations[0]
    });
  } catch (error) {
    console.error('Get station error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi server' 
    });
  }
});

module.exports = router;
