const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const externalUserController = require('../controllers/externalUserController');

/**
 * @swagger
 * /api/admin/external-users:
 *   get:
 *     tags: [API Configs]
 *     summary: Danh sách nhân sự hệ ngoài (từ external_users) cho dropdown
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: system
 *         schema:
 *           type: string
 *           default: 1office
 *       - in: query
 *         name: active
 *         schema:
 *           type: string
 *           enum: ['1', '0', 'true', 'false']
 *     responses:
 *       200:
 *         description: Thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.get('/', requireAuth, requireAdmin, externalUserController.getAll);

module.exports = router;
