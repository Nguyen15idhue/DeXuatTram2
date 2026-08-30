const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const viewFieldController = require('../controllers/viewFieldController');

/**
 * @swagger
 * /api/views/{viewId}/fields:
 *   get:
 *     tags: [View Fields]
 *     summary: Lấy danh sách fields của view (công khai)
 *     parameters:
 *       - in: path
 *         name: viewId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thành công
 *       404:
 *         description: Không tìm thấy view
 */
router.get('/:viewId/fields', viewFieldController.getFields);

/**
 * @swagger
 * /api/views/{viewId}/fields/reorder:
 *   put:
 *     tags: [View Fields]
 *     summary: Sắp xếp lại thứ tự fields
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: viewId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fields]
 *             properties:
 *               fields:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     order_index:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Sắp xếp thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy view
 */
router.put('/:viewId/fields/reorder', requireAuth, requireAdmin, viewFieldController.reorder);

/**
 * @swagger
 * /api/views/{viewId}/fields:
 *   post:
 *     tags: [View Fields]
 *     summary: Thêm field vào view
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: viewId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [field_id]
 *             properties:
 *               field_id:
 *                 type: integer
 *               order_index:
 *                 type: integer
 *               visible:
 *                 type: boolean
 *                 default: true
 *               width:
 *                 type: integer
 *               sortable:
 *                 type: boolean
 *                 default: true
 *               filterable:
 *                 type: boolean
 *                 default: false
 *               config:
 *                 type: object
 *     responses:
 *       201:
 *         description: Thêm thành công
 *       400:
 *         description: Field không tồn tại hoặc entity mismatch
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy view
 */
router.post('/:viewId/fields', requireAuth, requireAdmin, viewFieldController.addField);

/**
 * @swagger
 * /api/views/{viewId}/fields/{id}:
 *   put:
 *     tags: [View Fields]
 *     summary: Cập nhật field config trong view
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: viewId
 *         required: true
 *         schema:
 *           type: integer
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
 *             properties:
 *               order_index:
 *                 type: integer
 *               visible:
 *                 type: boolean
 *               width:
 *                 type: integer
 *               sortable:
 *                 type: boolean
 *               filterable:
 *                 type: boolean
 *               config:
 *                 type: object
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy
 */
router.put('/:viewId/fields/:id', requireAuth, requireAdmin, viewFieldController.updateField);

/**
 * @swagger
 * /api/views/{viewId}/fields/{id}:
 *   delete:
 *     tags: [View Fields]
 *     summary: Xóa field khỏi view
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: viewId
 *         required: true
 *         schema:
 *           type: integer
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
router.delete('/:viewId/fields/:id', requireAuth, requireAdmin, viewFieldController.deleteField);

module.exports = router;
