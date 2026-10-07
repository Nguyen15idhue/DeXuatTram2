const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middlewares/auth');
const lifecycleConfigController = require('../controllers/lifecycleConfigController');

/**
 * @swagger
 * /api/admin/lifecycle-config:
 *   get:
 *     tags: [Admin - Lifecycle]
 *     summary: Cấu hình countdown (bổ sung thông tin / chuyển trạng thái) theo trạng thái + giờ cảnh báo
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: '{ warn_hours, rules: [{ status, days, hours, minutes, enabled, type }] } với type = supplement | transition'
 *       401:
 *         description: Chưa xác thực
 */
router.get('/', requireAuth, lifecycleConfigController.get);

/**
 * @swagger
 * /api/admin/lifecycle-config:
 *   put:
 *     tags: [Admin - Lifecycle]
 *     summary: Cập nhật cấu hình countdown (SUPER_ADMIN)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               warn_hours: { type: integer, example: 24 }
 *               rules:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     status: { type: string, example: APPROVED }
 *                     days: { type: integer, example: 10 }
 *                     hours: { type: integer, example: 0 }
 *                     minutes: { type: integer, example: 0 }
 *                     enabled: { type: boolean, example: true }
 *                     type: { type: string, enum: [supplement, transition], example: supplement }
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 */
router.put('/', requireAuth, requireSuperAdmin, lifecycleConfigController.update);

module.exports = router;
