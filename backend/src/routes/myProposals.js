const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const { requireAuth } = require('../middlewares/auth');

/**
 * @swagger
 * /api/my-proposals:
 *   get:
 *     tags: [My Proposals]
 *     summary: Lấy danh sách đề xuất của user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, REVIEWING, APPROVED, REJECTED]
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
 *                     $ref: '#/components/schemas/Proposal'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         description: Chưa xác thực
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = ['p.user_id = ?'];
    let params = [req.user.id];

    if (status) {
      where.push('p.status = ?');
      params.push(status);
    }

    const whereClause = 'WHERE ' + where.join(' AND ');

    const countQuery = `SELECT COUNT(*) as total FROM station_proposals p ${whereClause}`;
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0].total;

    const dataQuery = `
      SELECT p.id, p.latitude, p.longitude, p.owner_name, p.owner_phone,
              p.address, p.area, p.land_type, p.description, p.status,
              p.created_at
      FROM station_proposals p
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
    console.error('Get my proposals error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

/**
 * @swagger
 * /api/my-proposals/{id}:
 *   put:
 *     tags: [My Proposals]
 *     summary: Cập nhật đề xuất của mình
 *     description: Chỉ cập nhật được đề xuất có trạng thái PENDING
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
 *             required: [owner_name, owner_phone, address]
 *             properties:
 *               owner_name:
 *                 type: string
 *               owner_phone:
 *                 type: string
 *               address:
 *                 type: string
 *               area:
 *                 type: string
 *               land_type:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Trạng thái không phải PENDING hoặc dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       404:
 *         description: Không tìm thấy đề xuất hoặc không phải của user
 */
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
       SET owner_name = ?, owner_phone = ?, address = ?, area = ?, land_type = ?, description = ?, updated_at = NOW()
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

/**
 * @swagger
 * /api/my-proposals/{id}:
 *   delete:
 *     tags: [My Proposals]
 *     summary: Xóa đề xuất của mình
 *     description: Chỉ xóa được đề xuất có trạng thái PENDING
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
 *       400:
 *         description: Trạng thái không phải PENDING
 *       401:
 *         description: Chưa xác thực
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.query(
      'SELECT id, status FROM station_proposals WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }

    if (existing[0].status !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'Chỉ có thể xóa đề xuất đang ở trạng thái PENDING' });
    }

    await pool.query('DELETE FROM station_proposals WHERE id = ? AND user_id = ?', [id, req.user.id]);

    res.json({ success: true, message: 'Xóa đề xuất thành công' });
  } catch (error) {
    console.error('Delete my proposal error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
