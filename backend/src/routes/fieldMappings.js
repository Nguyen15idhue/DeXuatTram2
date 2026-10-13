const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middlewares/auth');
const fieldMappingController = require('../controllers/fieldMappingController');
const fieldMappingService = require('../services/fieldMappingService');

/**
 * @swagger
 * /api/admin/field-mappings/used-in-desc/{configId}:
 *   get:
 *     tags: [Field Mappings]
 *     summary: Lấy danh sách fields đã dùng trong desc template
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Danh sách fields
 */
router.get('/used-in-desc/:configId', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { configId } = req.params;
    const fields = await fieldMappingService.getUsedInDescFields(parseInt(configId));
    res.json({ success: true, data: fields });
  } catch (e) {
    res.status(e.statusCode || 500).json({ success: false, message: e.message });
  }
});

/**
 * @swagger
 * /api/admin/field-mappings/types:
 *   get:
 *     tags: [Field Mappings]
 *     summary: Lấy danh sách field types, 1Office fields và proposal fields
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/types', requireAuth, requireSuperAdmin, fieldMappingController.getFieldTypes);

/**
 * @swagger
 * /api/admin/field-mappings/metadata/{configId}:
 *   put:
 *     tags: [Field Mappings]
 *     summary: Cập nhật label/type của1Office fields
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: { "cf2": { "label": "Nhóm khách hàng", "type": "multiselect" } }
 *     responses:
 *       200:
 *         description: Thành công
 */
router.put('/metadata/:configId', requireAuth, requireSuperAdmin, fieldMappingController.updateFieldMetadata);

/**
 * @swagger
 * /api/admin/field-mappings/selected-fields/{configId}:
 *   get:
 *     tags: [Field Mappings]
 *     summary: Lấy danh sách proposal fields đã lưu
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/selected-fields/:configId', requireAuth, requireSuperAdmin, fieldMappingController.getSelectedFields);

/**
 * @swagger
 * /api/admin/field-mappings/selected-fields/{configId}:
 *   put:
 *     tags: [Field Mappings]
 *     summary: Lưu danh sách proposal fields đã fetch
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *     responses:
 *       200:
 *         description: Thành công
 */
router.put('/selected-fields/:configId', requireAuth, requireSuperAdmin, fieldMappingController.updateSelectedFields);

/**
 * @swagger
 * /api/admin/field-mappings/preview:
 *   post:
 *     tags: [Field Mappings]
 *     summary: Preview kết quả transform
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [value, mapping]
 *             properties:
 *               value:
 *                 description: Giá trị cần transform
 *               mapping:
 *                 type: object
 *                 description: Field mapping config
 *               direction:
 *                 type: string
 *                 enum: [push, pull]
 *                 default: push
 *     responses:
 *       200:
 *         description: Kết quả transform
 */
router.post('/preview', requireAuth, requireSuperAdmin, fieldMappingController.previewTransform);

/**
 * @swagger
 * /api/admin/field-mappings/{configId}:
 *   get:
 *     tags: [Field Mappings]
 *     summary: Lấy danh sách field mappings theo API config
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/:configId', requireAuth, requireSuperAdmin, fieldMappingController.getAllByConfig);

/**
 * @swagger
 * /api/admin/field-mappings/detail/{id}:
 *   get:
 *     tags: [Field Mappings]
 *     summary: Lấy chi tiết field mapping theo ID
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
 *       404:
 *         description: Không tìm thấy
 */
router.get('/detail/:id', requireAuth, requireSuperAdmin, fieldMappingController.getById);

/**
 * @swagger
 * /api/admin/field-mappings/{configId}:
 *   post:
 *     tags: [Field Mappings]
 *     summary: Tạo field mapping mới
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [source_field, target_field]
 *             properties:
 *               source_field:
 *                 type: string
 *               target_field:
 *                 type: string
 *               target_field_type:
 *                 type: string
 *                 enum: [text, textarea, number, email, phone, url, date, datetime, boolean, select, multiselect, file, formula, password, table]
 *               sync_enabled:
 *                 type: boolean
 *               direction:
 *                 type: string
 *                 enum: [push, pull, both]
 *               default_value:
 *                 type: string
 *               transform_rules:
 *                 type: object
 *     responses:
 *       201:
 *         description: Tạo thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 */
router.post('/:configId', requireAuth, requireSuperAdmin, fieldMappingController.create);

/**
 * @swagger
 * /api/admin/field-mappings/{id}:
 *   put:
 *     tags: [Field Mappings]
 *     summary: Cập nhật field mapping
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
 *             properties:
 *               source_field:
 *                 type: string
 *               target_field:
 *                 type: string
 *               target_field_type:
 *                 type: string
 *               sync_enabled:
 *                 type: boolean
 *               direction:
 *                 type: string
 *               default_value:
 *                 type: string
 *               transform_rules:
 *                 type: object
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       404:
 *         description: Không tìm thấy
 */
router.put('/:id', requireAuth, requireSuperAdmin, fieldMappingController.update);

/**
 * @swagger
 * /api/admin/field-mappings/{id}:
 *   delete:
 *     tags: [Field Mappings]
 *     summary: Xóa field mapping
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
 *       404:
 *         description: Không tìm thấy
 */
router.delete('/:id', requireAuth, requireSuperAdmin, fieldMappingController.remove);

module.exports = router;
