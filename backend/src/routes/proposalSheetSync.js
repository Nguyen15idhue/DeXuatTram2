const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const controller = require('../controllers/proposalSheetSyncController');

/**
 * @swagger
 * /api/admin/proposal-sheet-sync/status:
 *   get:
 *     tags: [Admin - Proposals]
 *     summary: Xem trạng thái đồng bộ đề xuất lên Google Sheets
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trạng thái cấu hình, hàng đợi và các lượt đồng bộ gần nhất
 *       403:
 *         description: Chỉ ADMIN và SUPER_ADMIN
 */
router.get('/status', requireAuth, requireAdmin, controller.status);

/**
 * @swagger
 * /api/admin/proposal-sheet-sync/daily:
 *   post:
 *     tags: [Admin - Proposals]
 *     summary: Xếp các đề xuất cập nhật hôm nay vào hàng đợi đồng bộ
 *     description: Tác vụ bất đồng bộ; API trả về ngay sau khi đã tạo lượt đồng bộ.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       202:
 *         description: Lượt đồng bộ được xếp hàng
 *       403:
 *         description: Chỉ ADMIN và SUPER_ADMIN
 *       409:
 *         description: Đang tạo một lượt đồng bộ khác
 *       503:
 *         description: Google Sheets chưa được cấu hình
 */
router.post('/daily', requireAuth, requireAdmin, controller.dailySync);

module.exports = router;
