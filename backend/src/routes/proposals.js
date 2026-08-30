const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const { requireAuth } = require('../middlewares/auth');
const { validateCreateProposal } = require('../middlewares/validators');

/**
 * @swagger
 * /api/proposals:
 *   get:
 *     tags: [Proposals]
 *     summary: Lấy danh sách đề xuất (công khai)
 *     description: Hiển thị trên bản đồ, không phân trang
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
 *                     $ref: '#/components/schemas/Proposal'
 */
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

/**
 * @swagger
 * /api/proposals/{id}:
 *   get:
 *     tags: [Proposals]
 *     summary: Lấy thông tin đề xuất theo ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
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
 *                   $ref: '#/components/schemas/Proposal'
 *       404:
 *         description: Không tìm thấy đề xuất
 */
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

/**
 * @swagger
 * /api/proposals:
 *   post:
 *     tags: [Proposals]
 *     summary: Tạo đề xuất mới
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude, owner_name, owner_phone, address]
 *             properties:
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
 *               owner_name:
 *                 type: string
 *                 example: Nguyen Van A
 *               owner_phone:
 *                 type: string
 *                 pattern: '^\d{10}$'
 *                 example: 0912345678
 *               address:
 *                 type: string
 *                 example: Quận Hoàn Kiếm, Hà Nội
 *               area:
 *                 type: string
 *                 example: 100m2
 *               land_type:
 *                 type: string
 *                 example: Dân cư
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
 *                   $ref: '#/components/schemas/Proposal'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 */
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
