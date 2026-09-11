const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const notificationController = require('../controllers/notificationController');

/**
 * @swagger
 * /api/notifications/all:
 *   get:
 *     tags: [Notifications]
 *     summary: Tất cả thông báo (ADMIN/SUPER_ADMIN — chỉ đọc)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Thành công }
 *       403: { description: Không có quyền }
 */
router.get('/all', requireAuth, requireAdmin, notificationController.getAllAdmin);

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Danh sách thông báo của tôi
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Thành công }
 */
router.get('/', requireAuth, notificationController.getAll);

/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     tags: [Notifications]
 *     summary: Số thông báo chưa đọc
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Thành công }
 */
router.get('/unread-count', requireAuth, notificationController.getUnreadCount);

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   put:
 *     tags: [Notifications]
 *     summary: Đánh dấu 1 thông báo đã đọc
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Thành công }
 */
router.put('/:id/read', requireAuth, notificationController.markRead);

/**
 * @swagger
 * /api/notifications/read-all:
 *   put:
 *     tags: [Notifications]
 *     summary: Đánh dấu tất cả đã đọc
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Thành công }
 */
router.put('/read-all', requireAuth, notificationController.markAllRead);

module.exports = router;
