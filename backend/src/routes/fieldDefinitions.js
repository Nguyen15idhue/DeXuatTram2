const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const fieldDefinitionController = require('../controllers/fieldDefinitionController');

/**
 * @swagger
 * /api/field-definitions:
 *   get:
 *     tags: [Field Definitions]
 *     summary: Lấy danh sách field definitions
 *     description: Admin có thể filter theo entity, status. Phân trang.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entity
 *         schema:
 *           type: string
 *           enum: [stations, station_proposals, users]
 *         description: Filter theo entity
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *         description: Filter theo trạng thái
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.get('/', requireAuth, requireAdmin, fieldDefinitionController.getAll);

/**
 * @swagger
 * /api/field-definitions/entity/{entity}:
 *   get:
 *     tags: [Field Definitions]
 *     summary: Lấy field definitions theo entity (công khai)
 *     description: Trả về các field active của entity
 *     parameters:
 *       - in: path
 *         name: entity
 *         required: true
 *         schema:
 *           type: string
 *           enum: [stations, station_proposals, users]
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/entity/:entity', fieldDefinitionController.getByEntity);

/**
 * @swagger
 * /api/field-definitions/{id}:
 *   get:
 *     tags: [Field Definitions]
 *     summary: Lấy field definition theo ID
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
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy
 */
router.get('/:id', requireAuth, requireAdmin, fieldDefinitionController.getById);

/**
 * @swagger
 * /api/field-definitions:
 *   post:
 *     tags: [Field Definitions]
 *     summary: Tạo field definition mới
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entity, key, label]
 *             properties:
 *               entity:
 *                 type: string
 *                 enum: [stations, station_proposals, users]
 *               key:
 *                 type: string
 *               label:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [text, textarea, number, email, phone, url, date, datetime, boolean, select, multiselect, file, formula]
 *                 default: text
 *               source_type:
 *                 type: string
 *                 enum: [json]
 *                 default: json
 *               required:
 *                 type: boolean
 *                 default: false
 *               options:
 *                 type: object
 *               placeholder:
 *                 type: string
 *               help_text:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 default: active
 *     responses:
 *       201:
 *         description: Tạo thành công
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc duplicate key
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.post('/', requireAuth, requireAdmin, fieldDefinitionController.create);

/**
 * @swagger
 * /api/field-definitions/{id}:
 *   put:
 *     tags: [Field Definitions]
 *     summary: Cập nhật field definition
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entity, key, label]
 *             properties:
 *               entity:
 *                 type: string
 *               key:
 *                 type: string
 *               label:
 *                 type: string
 *               type:
 *                 type: string
 *               required:
 *                 type: boolean
 *               options:
 *                 type: object
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy
 */
router.put('/:id', requireAuth, requireAdmin, fieldDefinitionController.update);

/**
 * @swagger
 * /api/field-definitions/{id}:
 *   delete:
 *     tags: [Field Definitions]
 *     summary: Xóa field definition
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
 *         description: Xóa thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy
 */
router.delete('/:id', requireAuth, requireAdmin, fieldDefinitionController.delete);

/**
 * @swagger
 * /api/field-definitions/{id}/status:
 *   patch:
 *     tags: [Field Definitions]
 *     summary: Cập nhật trạng thái field definition
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Status không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy
 */
router.patch('/:id/status', requireAuth, requireAdmin, fieldDefinitionController.updateStatus);

module.exports = router;
