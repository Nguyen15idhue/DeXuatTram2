const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const formFieldController = require('../controllers/formFieldController');

/**
 * @swagger
 * /api/forms/{formId}/fields:
 *   get:
 *     tags: [Form Fields]
 *     summary: Lấy danh sách fields của form (công khai)
 *     parameters:
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thành công
 *       404:
 *         description: Không tìm thấy form
 */
router.get('/:formId/fields', formFieldController.getFields);

/**
 * @swagger
 * /api/forms/{formId}/fields/reorder:
 *   put:
 *     tags: [Form Fields]
 *     summary: Sắp xếp lại thứ tự fields
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
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
 *       400:
 *         description: fields không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 *       404:
 *         description: Không tìm thấy form
 */
router.put('/:formId/fields/reorder', requireAuth, requireAdmin, formFieldController.reorder);

/**
 * @swagger
 * /api/forms/{formId}/fields:
 *   post:
 *     tags: [Form Fields]
 *     summary: Thêm field vào form
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
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
 *         description: Không tìm thấy form
 */
router.post('/:formId/fields', requireAuth, requireAdmin, formFieldController.addField);

/**
 * @swagger
 * /api/forms/{formId}/fields/{id}:
 *   put:
 *     tags: [Form Fields]
 *     summary: Cập nhật field config trong form
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
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
router.put('/:formId/fields/:id', requireAuth, requireAdmin, formFieldController.updateField);

/**
 * @swagger
 * /api/forms/{formId}/fields/{id}:
 *   delete:
 *     tags: [Form Fields]
 *     summary: Xóa field khỏi form
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
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
router.delete('/:formId/fields/:id', requireAuth, requireAdmin, formFieldController.deleteField);

module.exports = router;
