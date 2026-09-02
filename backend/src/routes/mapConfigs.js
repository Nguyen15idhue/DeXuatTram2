const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const mapConfigController = require('../controllers/mapConfigController');

/**
 * @swagger
 * /api/map-configs/tile-providers:
 *   get:
 *     tags: [Map Config]
 *     summary: Danh sách tile providers có sẵn
 *     description: Trả về danh sách các tile provider miễn phí đã tích hợp
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/tile-providers', mapConfigController.getTileProviders);

/**
 * @swagger
 * /api/map-configs:
 *   get:
 *     tags: [Map Config]
 *     summary: Lấy cấu hình bản đồ
 *     description: Lấy config theo entity (stations mặc định)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entity
 *         schema:
 *           type: string
 *           default: stations
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/', mapConfigController.getConfig);

/**
 * @swagger
 * /api/map-configs:
 *   post:
 *     tags: [Map Config]
 *     summary: Tạo cấu hình bản đồ mới
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Tạo thành công
 */
router.post('/', requireAuth, requireAdmin, mapConfigController.createConfig);

/**
 * @swagger
 * /api/map-configs/{id}:
 *   put:
 *     tags: [Map Config]
 *     summary: Cập nhật cấu hình bản đồ
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
 *         description: Cập nhật thành công
 */
router.put('/:id', requireAuth, requireAdmin, mapConfigController.updateConfig);

/**
 * @swagger
 * /api/map-configs/{id}:
 *   delete:
 *     tags: [Map Config]
 *     summary: Xoá cấu hình bản đồ
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
 *         description: Xoá thành công
 */
router.delete('/:id', requireAuth, requireAdmin, mapConfigController.deleteConfig);

module.exports = router;
