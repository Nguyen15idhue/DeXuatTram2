const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const adminProposalController = require('../controllers/adminProposalController');

/**
 * @swagger
 * /api/admin/proposals:
 *   get:
 *     tags: [Admin - Proposals]
 *     summary: Admin lấy danh sách đề xuất (phân trang)
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
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.get('/', requireAuth, requireAdmin, adminProposalController.getAll);

/**
 * @swagger
 * /api/admin/proposals/{id}:
 *   delete:
 *     tags: [Admin - Proposals]
 *     summary: Admin xóa đề xuất
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
 *         description: Không tìm thấy đề xuất
 */
router.delete('/:id', requireAuth, requireAdmin, adminProposalController.delete);

/**
 * @swagger
 * /api/admin/proposals/{id}/status:
 *   put:
 *     tags: [Admin - Proposals]
 *     summary: Admin cập nhật trạng thái đề xuất
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, REVIEWING, APPROVED, REJECTED]
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Trạng thái không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.put('/:id/status', requireAuth, requireAdmin, adminProposalController.updateStatus);

module.exports = router;
