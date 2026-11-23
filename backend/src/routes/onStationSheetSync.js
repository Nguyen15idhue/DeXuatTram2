const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const controller = require('../controllers/onStationSheetSyncController');

/**
 * @swagger
 * /api/admin/on-station-sheet-sync/status:
 *   get:
 *     tags: [Admin - Proposals]
 *     summary: Trạng thái đồng bộ Google Sheet riêng cho trạm đã ON (đề xuất ACTIVE)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cấu hình, số trạm ACTIVE, hàng đợi và lần đồng bộ gần nhất
 *       403:
 *         description: Chỉ ADMIN và SUPER_ADMIN
 */
router.get('/status', requireAuth, requireAdmin, controller.status);

/**
 * @swagger
 * /api/admin/on-station-sheet-sync/daily:
 *   post:
 *     tags: [Admin - Proposals]
 *     summary: Xếp toàn bộ trạm ON hiện có vào hàng đợi đồng bộ Google Sheet
 *     description: Đồng bộ cột A–T, dùng Mã trạm CMS ở B làm khóa cập nhật/thêm. E giống S, F giống T; giữ nguyên U trở đi. Mã cũ khi đổi được giữ lại và cảnh báo xử lý thủ công.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Đã xếp hàng đợi
 *       403:
 *         description: Chỉ ADMIN và SUPER_ADMIN
 *       503:
 *         description: Google Sheet trạm ON chưa được cấu hình
 */
router.post('/daily', requireAuth, requireAdmin, controller.dailySync);

/**
 * @swagger
 * /api/admin/on-station-sheet-sync/cancel:
 *   post:
 *     tags: [Admin - Proposals]
 *     summary: Hủy các mục đồng bộ ON trạm đang chờ hoặc thất bại
 *     description: Không ảnh hưởng mục đang xử lý, đề xuất hoặc dữ liệu Google Sheet. Không cần cấu hình Google Sheet.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trả số mục đã hủy trong data.cancelled
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Chỉ ADMIN và SUPER_ADMIN
 */
router.post('/cancel', requireAuth, requireAdmin, controller.cancel);

/**
 * @swagger
 * /api/admin/on-station-sheet-sync/warnings/{id}/resolve:
 *   post:
 *     tags: [Admin - Proposals]
 *     summary: Xác nhận đã xử lý thủ công cảnh báo mã CMS cũ, không thay đổi Sheet
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Đã xác nhận }
 *       403: { description: Chỉ ADMIN và SUPER_ADMIN }
 *       404: { description: Không tìm thấy cảnh báo chưa xử lý }
 */
router.post('/warnings/:id/resolve', requireAuth, requireAdmin, controller.resolveWarning);

module.exports = router;
