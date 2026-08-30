const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const { validateCreateStation, validateUpdateStation } = require('../middlewares/validators');

// GET /api/stations - Get all stations (public, with search/filter/pagination)
router.get('/', async (req, res) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = [];
    let params = [];

    if (search) {
      where.push('(name LIKE ? OR address LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (status) {
      where.push('status = ?');
      params.push(status);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const countQuery = `SELECT COUNT(*) as total FROM stations ${whereClause}`;
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0].total;

    const dataQuery = `SELECT id, name, latitude, longitude, address, status, description, created_at FROM stations ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const [stations] = await pool.query(dataQuery, [...params, parseInt(limit), offset]);

    res.json({
      success: true,
      data: stations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get stations error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// GET /api/stations/:id - Get station by ID (public)
router.get('/:id', async (req, res) => {
  try {
    const [stations] = await pool.query('SELECT * FROM stations WHERE id = ?', [req.params.id]);
    if (stations.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy trạm' });
    }
    res.json({ success: true, data: stations[0] });
  } catch (error) {
    console.error('Get station error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// POST /api/stations - Create station (admin only)
router.post('/', requireAuth, requireAdmin, validateCreateStation, async (req, res) => {
  try {
    const { name, latitude, longitude, address, status, description } = req.body;

    const [result] = await pool.query(
      'INSERT INTO stations (name, latitude, longitude, address, status, description) VALUES (?, ?, ?, ?, ?, ?)',
      [name, latitude, longitude, address, status || 'ACTIVE', description || '']
    );

    const [station] = await pool.query('SELECT * FROM stations WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: station[0], message: 'Tạo trạm thành công' });
  } catch (error) {
    console.error('Create station error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// PUT /api/stations/:id - Update station (admin only)
router.put('/:id', requireAuth, requireAdmin, validateUpdateStation, async (req, res) => {
  try {
    const { name, latitude, longitude, address, status, description } = req.body;
    const { id } = req.params;

    const [existing] = await pool.query('SELECT id FROM stations WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy trạm' });
    }

    await pool.query(
      'UPDATE stations SET name = ?, latitude = ?, longitude = ?, address = ?, status = ?, description = ?, updated_at = NOW() WHERE id = ?',
      [name, latitude, longitude, address, status, description || '', id]
    );

    const [station] = await pool.query('SELECT * FROM stations WHERE id = ?', [id]);
    res.json({ success: true, data: station[0], message: 'Cập nhật trạm thành công' });
  } catch (error) {
    console.error('Update station error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// DELETE /api/stations/:id - Delete station (admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.query('SELECT id FROM stations WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy trạm' });
    }

    await pool.query('DELETE FROM stations WHERE id = ?', [id]);
    res.json({ success: true, message: 'Xóa trạm thành công' });
  } catch (error) {
    console.error('Delete station error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
