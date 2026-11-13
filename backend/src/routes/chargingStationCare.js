const express = require('express');
const router = express.Router();
const { requireAuth, requireChargingStationViewer, requireSuperAdmin } = require('../middlewares/auth');
const controller = require('../controllers/chargingStationCareController');

router.use(requireAuth);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/care-logs:
 *   get:
 *     tags: [Charging Station Care]
 *     summary: Lịch sử tiến độ ON trạm và quyền create/manage
 *     description: Kiểm tra phạm vi ON trạm; người cập nhật lấy từ created_by, giữ employee_user_id cũ để đối chiếu.
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Thành công }
 */
router.get('/:id/care-logs', requireChargingStationViewer, controller.list);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/care-logs:
 *   post:
 *     tags: [Charging Station Care]
 *     summary: Thêm tiến độ ON trạm
 *     description: SUPER_ADMIN, chủ đề xuất SALES, người phụ trách, cấp trên của chủ đề xuất hoặc Setup và Vận hành. Tác giả tự lấy tài khoản đăng nhập; không nhận người cập nhật từ payload.
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [contact_time, content]
 *             properties:
 *               contact_time:
 *                 type: string
 *                 description: Giờ địa phương Asia/Ho_Chi_Minh, YYYY-MM-DDTHH:mm hoặc YYYY-MM-DDTHH:mm:ss
 *               content: { type: string }
 *     responses:
 *       201: { description: Đã thêm }
 */
router.post('/:id/care-logs', requireChargingStationViewer, controller.create);

/**
 * @swagger
 * /api/admin/charging-stations/care-logs/{id}:
 *   put:
 *     tags: [Charging Station Care]
 *     summary: SUPER_ADMIN sửa thời gian/nội dung tiến độ, không đổi người tạo
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Thành công }
 */
router.put('/care-logs/:id', requireSuperAdmin, controller.update);

/**
 * @swagger
 * /api/admin/charging-stations/care-logs/{id}:
 *   delete:
 *     tags: [Charging Station Care]
 *     summary: SUPER_ADMIN xóa dòng tiến độ và lưu nhật ký
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Đã xóa }
 */
router.delete('/care-logs/:id', requireSuperAdmin, controller.remove);

/**
 * @swagger
 * /api/admin/charging-stations/care-logs/{id}/updater:
 *   get:
 *     tags: [Charging Station Care]
 *     summary: Hồ sơ rút gọn người cập nhật tiến độ (kiểm tra phạm vi ON trạm)
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: ID, tên, vai trò, phòng ban, chức vụ; không trả thông tin liên hệ }
 *       403: { description: Ngoài phạm vi xem ON trạm }
 *       404: { description: Dòng tiến độ hoặc người cập nhật không còn tồn tại }
 */
router.get('/care-logs/:id/updater', requireChargingStationViewer, controller.updater);

module.exports = router;
