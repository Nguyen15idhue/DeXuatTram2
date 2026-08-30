const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const dynamicEngineController = require('../controllers/dynamicEngineController');

/**
 * @swagger
 * /api/dynamic/{entity}/form/{formId}:
 *   get:
 *     tags: [Dynamic Engine]
 *     summary: Lấy cấu hình form để render
 *     description: Trả về form config kèm danh sách fields đã sắp xếp
 *     parameters:
 *       - in: path
 *         name: entity
 *         required: true
 *         schema:
 *           type: string
 *           enum: [stations, station_proposals, users]
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Entity không hợp lệ
 *       404:
 *         description: Không tìm thấy form
 */
router.get('/:entity/form/:formId', dynamicEngineController.getFormConfig);

/**
 * @swagger
 * /api/dynamic/{entity}/view/{viewId}:
 *   get:
 *     tags: [Dynamic Engine]
 *     summary: Lấy cấu hình view để render table
 *     description: Trả về view config kèm danh sách columns đã sắp xếp
 *     parameters:
 *       - in: path
 *         name: entity
 *         required: true
 *         schema:
 *           type: string
 *           enum: [stations, station_proposals, users]
 *       - in: path
 *         name: viewId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Entity không hợp lệ
 *       404:
 *         description: Không tìm thấy view
 */
router.get('/:entity/view/:viewId', dynamicEngineController.getViewConfig);

/**
 * @swagger
 * /api/dynamic/{entity}/validate:
 *   post:
 *     tags: [Dynamic Engine]
 *     summary: Validate data theo field definitions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entity
 *         required: true
 *         schema:
 *           type: string
 *           enum: [stations, station_proposals, users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [data]
 *             properties:
 *               data:
 *                 type: object
 *                 description: Dữ liệu cần validate
 *     responses:
 *       200:
 *         description: Kết quả validate
 *       400:
 *         description: Entity không hợp lệ
 *       401:
 *         description: Chưa xác thực
 */
router.post('/:entity/validate', requireAuth, dynamicEngineController.validateData);

module.exports = router;
