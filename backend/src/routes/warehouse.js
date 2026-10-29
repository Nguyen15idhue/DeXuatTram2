const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const warehouseController = require('../controllers/warehouseController');

router.use(requireAuth, requireAdmin);

/**
 * @swagger
 * /api/admin/warehouse/poles:
 *   get:
 *     tags: [Warehouse]
 *     summary: Danh sách trụ sạc trong kho
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Thành công }
 */
router.get('/poles', warehouseController.listPoles);

/**
 * @swagger
 * /api/admin/warehouse/poles:
 *   post:
 *     tags: [Warehouse]
 *     summary: Thêm trụ sạc vào danh mục kho
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, charging_type, power_kw]
 *             properties:
 *               name: { type: string }
 *               charging_type: { type: string, enum: [AC, DC] }
 *               power_kw: { type: number }
 *               quantity: { type: integer }
 *               supplier: { type: string }
 *     responses:
 *       201: { description: Đã thêm }
 */
router.post('/poles', warehouseController.createPole);

/**
 * @swagger
 * /api/admin/warehouse/poles/{id}:
 *   put:
 *     tags: [Warehouse]
 *     summary: Cập nhật trụ sạc
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Thành công }
 */
router.put('/poles/:id', warehouseController.updatePole);

/**
 * @swagger
 * /api/admin/warehouse/poles/{id}:
 *   delete:
 *     tags: [Warehouse]
 *     summary: Xóa trụ sạc (chỉ khi chưa phát sinh nhập/xuất)
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Đã xóa }
 *       400: { description: Đã phát sinh nhập/xuất }
 */
router.delete('/poles/:id', warehouseController.deletePole);

/**
 * @swagger
 * /api/admin/warehouse/imports:
 *   get:
 *     tags: [Warehouse]
 *     summary: Danh sách phiếu nhập kho
 *     security: [ { bearerAuth: [] } ]
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
router.get('/imports', warehouseController.listImports);

/**
 * @swagger
 * /api/admin/warehouse/imports/{id}:
 *   get:
 *     tags: [Warehouse]
 *     summary: Chi tiết phiếu nhập kho
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Thành công }
 */
router.get('/imports/:id', warehouseController.getImport);

/**
 * @swagger
 * /api/admin/warehouse/imports:
 *   post:
 *     tags: [Warehouse]
 *     summary: Tạo phiếu nhập kho và tăng tồn kho
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [import_date, items]
 *             properties:
 *               import_date: { type: string, format: date-time }
 *               charging_station_id: { type: integer, nullable: true }
 *               note: { type: string }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [pole_id, quantity]
 *                   properties:
 *                     pole_id: { type: integer }
 *                     quantity: { type: integer }
 *     responses:
 *       201: { description: Đã nhập kho }
 */
router.post('/imports', warehouseController.createImport);

/**
 * @swagger
 * /api/admin/warehouse/exports:
 *   get:
 *     tags: [Warehouse]
 *     summary: Danh sách phiếu xuất kho
 *     security: [ { bearerAuth: [] } ]
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
router.get('/exports', warehouseController.listExports);

/**
 * @swagger
 * /api/admin/warehouse/exports/{id}:
 *   get:
 *     tags: [Warehouse]
 *     summary: Chi tiết phiếu xuất kho
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Thành công }
 */
router.get('/exports/:id', warehouseController.getExport);

/**
 * @swagger
 * /api/admin/warehouse/exports:
 *   post:
 *     tags: [Warehouse]
 *     summary: Tạo phiếu xuất kho và giảm tồn kho
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [export_date, charging_station_id, items]
 *             properties:
 *               export_date: { type: string, format: date-time }
 *               charging_station_id: { type: integer }
 *               reason: { type: string }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [pole_id, quantity]
 *                   properties:
 *                     pole_id: { type: integer }
 *                     quantity: { type: integer }
 *     responses:
 *       201: { description: Đã xuất kho }
 *       400: { description: Không đủ tồn kho }
 */
router.post('/exports', warehouseController.createExport);

/**
 * @swagger
 * /api/admin/warehouse/stock:
 *   get:
 *     tags: [Warehouse]
 *     summary: Tồn kho hiện tại của các trụ sạc
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200: { description: Thành công }
 */
router.get('/stock', warehouseController.getStock);

module.exports = router;
