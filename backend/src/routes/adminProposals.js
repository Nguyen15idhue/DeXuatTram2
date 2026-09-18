const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin, requireUserManager } = require('../middlewares/auth');
const { validateUpdateProposal } = require('../middlewares/validators');
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
 *           enum: [PENDING, REVIEWING, APPROVED, REJECTED, CANCELLED, CONTRACT_SIGNED, CONTRACT_FAILED]
 *       - in: query
 *         name: uu_tien
 *         schema:
 *           type: string
 *           enum: ['1', '2']
 *         description: Lọc theo loại ưu tiên (1 = Cấp 1/TDT, 2 = Cấp 2/LK/NQ)
  *       - in: query
  *         name: filters
  *         schema:
  *           type: string
  *         description: Lọc theo cột dạng JSON (VD {"owner_name":"abc"}) — tìm trên toàn bộ database, không chỉ trang hiện tại
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
router.get('/', requireAuth, requireUserManager, adminProposalController.getAll);

/**
 * @swagger
 * /api/admin/proposals/duplicates:
 *   get:
 *     tags: [Admin - Proposals]
 *     summary: Tìm cặp đề xuất/trạm trùng lặp theo khoảng cách
 *     description: So sánh toàn bộ đề xuất (trừ REJECTED) với nhau và với trạm. Khoảng cách Haversine, tính bằng mét.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: min_m
 *         schema:
 *           type: number
 *           default: 200
 *         description: Khoảng cách tối thiểu (m)
 *       - in: query
 *         name: max_m
 *         schema:
 *           type: number
 *           default: 2000
 *         description: Khoảng cách tối đa (m, tối đa 5000)
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Tham số không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.get('/duplicates', requireAuth, requireUserManager, adminProposalController.duplicates);

/**
 * @swagger
 * /api/admin/proposals/{id}:
 *   get:
 *     tags: [Admin - Proposals]
 *     summary: Admin lấy chi tiết đề xuất theo ID
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
 *         description: Thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.get('/:id', requireAuth, requireUserManager, adminProposalController.getById);

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
router.delete('/:id', requireAuth, requireUserManager, adminProposalController.delete);

/**
 * @swagger
 * /api/admin/proposals/{id}:
 *   put:
 *     tags: [Admin - Proposals]
 *     summary: Admin cập nhật đề xuất (chỉ ADMIN/SUPER_ADMIN; sales đổi trạng thái qua /status)
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
 *               status:
 *                 type: string
 *                 enum: [PENDING, REVIEWING, APPROVED, REJECTED, CANCELLED, CONTRACT_SIGNED, CONTRACT_FAILED]
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.put('/:id', requireAuth, requireAdmin, validateUpdateProposal, adminProposalController.update);

/**
 * @swagger
 * /api/admin/proposals/{id}/status:
 *   put:
 *     tags: [Admin - Proposals]
  *     summary: Cập nhật trạng thái đề xuất theo ma trận (Duyệt REVIEWING tự tạo lệnh đẩy 1Office)
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
 *                 enum: [PENDING, REVIEWING, APPROVED, REJECTED, CANCELLED, CONTRACT_SIGNED, CONTRACT_FAILED]
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
router.put('/:id/status', requireAuth, requireUserManager, adminProposalController.updateStatus);

/**
 * @swagger
 * /api/admin/proposals/{id}/convert-to-station:
 *   post:
 *     tags: [Admin - Proposals]
 *     summary: Tạo trạm từ đề xuất Ký thành công (chỉ ADMIN/SUPER_ADMIN, nút tay)
 *     description: Tự sinh tên `Trạm {mã đề xuất}` (cho phép ghi đè qua body.name), địa chỉ/vùng miền/tỉnh tự fill, trạng thái Triển khai, mô hình 1:1. Đã có station_id thì trả trạm hiện có.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Không đúng trạng thái Ký thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin (SALES/CTV bị chặn)
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.post('/:id/convert-to-station', requireAuth, requireAdmin, adminProposalController.convertToStation);

module.exports = router;
