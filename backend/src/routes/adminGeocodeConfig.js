const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middlewares/auth');
const geocodeController = require('../controllers/geocodeController');

/**
 * @swagger
 * /api/admin/geocode-config:
 *   get:
 *     tags: [Geocode]
 *     summary: Lấy cấu hình reverse geocoding
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/', requireAuth, requireSuperAdmin, geocodeController.getConfig);

/**
 * @swagger
 * /api/admin/geocode-config:
 *   put:
 *     tags: [Geocode]
 *     summary: Cập nhật cấu hình reverse geocoding
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */
router.put('/', requireAuth, requireSuperAdmin, geocodeController.updateConfig);

/**
 * @swagger
 * /api/admin/geocode-config/test:
 *   post:
 *     tags: [Geocode]
 *     summary: Test reverse geocoding với tọa độ mẫu
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.post('/test', requireAuth, requireSuperAdmin, geocodeController.test);

module.exports = router;
