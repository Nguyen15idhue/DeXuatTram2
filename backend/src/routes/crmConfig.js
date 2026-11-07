const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middlewares/auth');
const crmConfigController = require('../controllers/crmConfigController');
const crmFullSyncController = require('../controllers/crmFullSyncController');

router.get('/config', requireAuth, requireSuperAdmin, crmConfigController.getConfig);
router.post('/sync-now', requireAuth, requireSuperAdmin, crmConfigController.syncNow);
router.get('/outbox', requireAuth, requireSuperAdmin, crmConfigController.listOutbox);
router.get('/outbox/:id', requireAuth, requireSuperAdmin, crmConfigController.getOutboxDetail);
router.post('/outbox/:id/retry', requireAuth, requireSuperAdmin, crmConfigController.retryOutbox);
router.post('/outbox/:id/cancel', requireAuth, requireSuperAdmin, crmConfigController.cancelOutbox);
router.post('/outbox/retry-all', requireAuth, requireSuperAdmin, crmConfigController.retryAllOutbox);
router.post('/test-webhook', requireAuth, requireSuperAdmin, crmConfigController.testWebhook);
router.get('/logs', requireAuth, requireSuperAdmin, crmConfigController.listLogs);
router.get('/logs/export', requireAuth, requireSuperAdmin, crmConfigController.exportLogs);
router.get('/logs/:id', requireAuth, requireSuperAdmin, crmConfigController.getLogDetail);

/**
 * @swagger
 * /api/admin/crm/full-sync:
 *   post:
 *     summary: Bắt đầu đồng bộ toàn bộ khách hàng từ TMT CRM về Quản lý leads
 *     tags: [CRM]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       202:
 *         description: Đã tạo lần đồng bộ mới
 *       200:
 *         description: Đang có lần đồng bộ chạy (trả về lần đang chạy)
 *       400:
 *         description: Chưa cấu hình TMT_CRM_API_KEY
 */
router.post('/full-sync', requireAuth, requireSuperAdmin, crmFullSyncController.start);

/**
 * @swagger
 * /api/admin/crm/full-sync/status:
 *   get:
 *     summary: Trạng thái lần đồng bộ toàn bộ gần nhất + tiến trình
 *     tags: [CRM]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/full-sync/status', requireAuth, requireSuperAdmin, crmFullSyncController.status);

/**
 * @swagger
 * /api/admin/crm/full-sync/runs:
 *   get:
 *     summary: Lịch sử các lần đồng bộ toàn bộ
 *     tags: [CRM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/full-sync/runs', requireAuth, requireSuperAdmin, crmFullSyncController.runs);

/**
 * @swagger
 * /api/admin/crm/full-sync/{id}/resume:
 *   post:
 *     summary: Tiếp tục lần đồng bộ bị lỗi/đạt giới hạn/đã hủy
 *     tags: [CRM]
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
 *         description: OK
 *       404:
 *         description: Không tìm thấy lần đồng bộ
 *       409:
 *         description: Đang có lần đồng bộ khác chạy
 */
router.post('/full-sync/:id/resume', requireAuth, requireSuperAdmin, crmFullSyncController.resume);

/**
 * @swagger
 * /api/admin/crm/full-sync/{id}/cancel:
 *   post:
 *     summary: Hủy lần đồng bộ đang chờ/đang chạy
 *     tags: [CRM]
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
 *         description: OK
 */
router.post('/full-sync/:id/cancel', requireAuth, requireSuperAdmin, crmFullSyncController.cancel);

/**
 * @swagger
 * /api/admin/crm/full-sync/{id}/export:
 *   get:
 *     summary: Xuất Excel kết quả đồng bộ (Tổng kết + Bỏ qua/Lỗi)
 *     tags: [CRM]
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
 *         description: File .xlsx
 */
router.get('/full-sync/:id/export', requireAuth, requireSuperAdmin, crmFullSyncController.exportRun);

module.exports = router;
