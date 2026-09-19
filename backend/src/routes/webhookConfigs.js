const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middlewares/auth');
const webhookConfigController = require('../controllers/webhookConfigController');

/**
 * @swagger
 * /api/admin/webhook-configs:
 *   get:
 *     tags: [Webhook Configs]
 *     summary: Danh sách webhook (secret masked)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/', requireAuth, requireSuperAdmin, webhookConfigController.list);

/**
 * @swagger
 * /api/admin/webhook-configs:
 *   post:
 *     tags: [Webhook Configs]
 *     summary: Thêm webhook mới (secret trả plaintext 1 lần)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               note:
 *                 type: string
 *     responses:
 *       201:
 *         description: Đã tạo
 */
router.post('/', requireAuth, requireSuperAdmin, webhookConfigController.create);

/**
 * @swagger
 * /api/admin/webhook-configs/{id}/rotate:
 *   post:
 *     tags: [Webhook Configs]
 *     summary: Xoay secret webhook
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
 *         description: Secret mới (plaintext 1 lần)
 */
router.post('/:id/rotate', requireAuth, requireSuperAdmin, webhookConfigController.rotate);

/**
 * @swagger
 * /api/admin/webhook-configs/{id}/active:
 *   put:
 *     tags: [Webhook Configs]
 *     summary: Bật/tắt webhook
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
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Thành công
 */
router.put('/:id/active', requireAuth, requireSuperAdmin, webhookConfigController.setActive);

/**
 * @swagger
 * /api/admin/webhook-configs/{id}:
 *   delete:
 *     tags: [Webhook Configs]
 *     summary: Xóa webhook
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
 */
router.delete('/:id', requireAuth, requireSuperAdmin, webhookConfigController.remove);

/**
 * @swagger
 * /api/admin/webhook-configs/test-send:
 *   post:
 *     tags: [Webhook Configs]
 *     summary: Bắn thử event webhook (demo nội bộ)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [event]
 *             properties:
 *               event:
 *                 type: string
                 *                 enum: [APPROVED, ARCHIVED, CONTRACT_SIGNED, CONTRACT_FAILED, CANCELLED]
 *               proposal_code:
 *                 type: string
 *               contact_code:
 *                 type: string
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Kết quả xử lý event
 */
router.post('/test-send', requireAuth, requireSuperAdmin, webhookConfigController.testSend);

/**
 * @swagger
 * /api/admin/webhook-configs/inbound-logs:
 *   get:
 *     tags: [Webhook Configs]
 *     summary: Log webhook đã nhận (cho màn lắng nghe realtime)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: since_id
 *         schema:
 *           type: integer
 *         description: Chỉ lấy log mới hơn id này
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [completed, failed]
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/inbound-logs', requireAuth, requireSuperAdmin, webhookConfigController.inboundLogs);

module.exports = router;
