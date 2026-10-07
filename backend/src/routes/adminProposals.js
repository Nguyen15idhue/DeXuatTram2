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
 *           enum: [PENDING, REVIEWING, PRINCIPLE_APPROVED, APPROVED, REJECTED, CANCELLED, CONTRACT_SIGNED, CONTRACT_FAILED, ARCHIVED]
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
 * /api/admin/proposals/{id}/push-check:
 *   get:
 *     tags: [Admin - Proposals]
 *     summary: Kiểm tra liên kết 1Office của người phụ trách trước khi duyệt/đẩy
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
 *         description: Trả về missing (chưa gán) và unlinked (đã gán nhưng chưa liên kết / chưa có tài khoản 1Office)
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.get('/:id/push-check', requireAuth, requireUserManager, adminProposalController.pushCheck);

/**
 * @swagger
 * /api/admin/proposals/{id}/completeness:
 *   get:
 *     tags: [Admin - Proposals]
 *     summary: Kiểm tra đầy đủ thông tin theo form sửa trước khi duyệt/đẩy
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
 *         description: Trả về complete (đủ/không) và missing (danh sách thiếu)
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.get('/:id/completeness', requireAuth, requireUserManager, adminProposalController.completeness);

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
 *     summary: Admin cập nhật đề xuất (ADMIN/SUPER_ADMIN tất cả; SALES trong nhánh; đổi trạng thái qua /status)
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
 *                 enum: [PENDING, REVIEWING, PRINCIPLE_APPROVED, APPROVED, REJECTED, CANCELLED, CONTRACT_SIGNED, CONTRACT_FAILED, ARCHIVED]
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
router.put('/:id', requireAuth, requireUserManager, validateUpdateProposal, adminProposalController.update);

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
 *                 enum: [PENDING, REVIEWING, PRINCIPLE_APPROVED, APPROVED, REJECTED, CANCELLED, CONTRACT_SIGNED, CONTRACT_FAILED, ARCHIVED]
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
 * /api/admin/proposals/{id}/confirm-info:
 *   post:
 *     tags: [Admin - Proposals]
 *     summary: Xác nhận đề xuất đã đủ thông tin (thông báo tới admin)
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
 *         description: Xác nhận thành công
 *       400:
 *         description: Đề xuất không trong thời gian bổ sung thông tin
 *       403:
 *         description: Ngoài phạm vi nhánh
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.post('/:id/confirm-info', requireAuth, requireUserManager, adminProposalController.confirmInfo);

/**
 * @swagger
 * /api/admin/proposals/{id}/reopen-info:
 *   post:
 *     tags: [Admin - Proposals]
 *     summary: Mở lại đề xuất để bổ sung tiếp (giữ deadline cũ)
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
 *         description: Mở lại thành công
 *       400:
 *         description: Đề xuất không trong thời gian bổ sung thông tin
 *       403:
 *         description: Ngoài phạm vi nhánh
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.post('/:id/reopen-info', requireAuth, requireUserManager, adminProposalController.reopenInfo);

/**
 * @swagger
 * /api/admin/proposals/{id}/extend-deadline:
 *   post:
 *     tags: [Admin - Proposals]
 *     summary: Gia hạn thời gian bổ sung thông tin (cộng vào deadline hiện tại)
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
 *             required: [reason]
 *             properties:
 *               days:
 *                 type: integer
 *                 default: 0
 *                 description: Số ngày gia hạn (tối đa theo cấu hình extend_max_days_per_time)
 *               hours:
 *                 type: integer
 *                 default: 0
 *                 description: Số giờ gia hạn (0-23)
 *               reason:
 *                 type: string
 *                 description: Lý do gia hạn (bắt buộc)
 *     responses:
 *       200:
 *         description: Gia hạn thành công
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc đề xuất đã quá hạn
 *       403:
 *         description: Ngoài phạm vi nhánh
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.post('/:id/extend-deadline', requireAuth, requireUserManager, adminProposalController.extendDeadline);

/**
 * @swagger
 * /api/admin/proposals/{id}/extend-info:
 *   get:
 *     tags: [Admin - Proposals]
 *     summary: Xem giới hạn và số lần gia hạn còn lại của đề xuất
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
 *         description: Thông tin gia hạn (maxTimes, maxDaysPerTime, used, remaining)
 *       403:
 *         description: Ngoài phạm vi nhánh
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.get('/:id/extend-info', requireAuth, requireUserManager, adminProposalController.extendInfo);

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

/**
 * @swagger
 * /api/admin/proposals/reports:
 *   post:
 *     tags: [Proposals]
 *     summary: Xuất báo cáo đề xuất (.docx lẻ, .zip khi nhiều)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [proposalIds]
 *             properties:
 *               proposalIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Tối đa 50 ID
 *               templateId:
 *                 type: integer
 *                 description: Ép dùng template (bỏ trống để tự chọn theo mô hình)
 *     responses:
 *       200:
 *         description: File báo cáo
 *       400:
 *         description: Không xuất được
 *       403:
 *         description: Ngoài phạm vi nhánh
 */
router.post('/reports', requireAuth, requireUserManager, adminProposalController.exportReports);

module.exports = router;
