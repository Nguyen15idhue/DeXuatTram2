const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const { validateCreateStation, validateUpdateStation } = require('../middlewares/validators');

/**
 * @swagger
 * /api/stations:
 *   get:
 *     tags: [Stations]
 *     summary: Lấy danh sách trạm (công khai)
 *     description: Tìm kiếm, lọc theo trạng thái, phân trang
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm theo tên hoặc địa chỉ
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, DEPLOYING]
 *         description: Lọc theo trạng thái
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Station'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
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

/**
 * @swagger
 * /api/stations/{id}:
 *   get:
 *     tags: [Stations]
 *     summary: Lấy thông tin trạm theo ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID trạm
 *     responses:
 *       200:
 *         description: Thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Station'
 *       404:
 *         description: Không tìm thấy trạm
 */
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

/**
 * @swagger
 * /api/stations:
 *   post:
 *     tags: [Stations]
 *     summary: Tạo trạm mới (Admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, latitude, longitude, address]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 example: Trạm Hà Nội
 *               latitude:
 *                 type: number
 *                 minimum: -90
 *                 maximum: 90
 *                 example: 21.0285
 *               longitude:
 *                 type: number
 *                 minimum: -180
 *                 maximum: 180
 *                 example: 105.8542
 *               address:
 *                 type: string
 *                 example: Quận Hoàn Kiếm, Hà Nội
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, DEPLOYING]
 *                 default: ACTIVE
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Station'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
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

/**
 * @swagger
 * /api/stations/{id}:
 *   put:
 *     tags: [Stations]
 *     summary: Cập nhật trạm (Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, latitude, longitude, address, status]
 *             properties:
 *               name:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               address:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, DEPLOYING]
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy trạm
 */
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

/**
 * @swagger
 * /api/stations/{id}:
 *   delete:
 *     tags: [Stations]
 *     summary: Xóa trạm (Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy trạm
 */
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
