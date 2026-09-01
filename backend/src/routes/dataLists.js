const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const dataListController = require('../controllers/dataListController');
const excelService = require('../services/excelService');

/**
 * @swagger
 * /api/data-lists:
 *   get:
 *     tags: [Data Lists]
 *     summary: Danh sách data lists
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/', requireAuth, requireAdmin, dataListController.getAll);

/**
 * @swagger
 * /api/data-lists/{id}:
 *   get:
 *     tags: [Data Lists]
 *     summary: Chi tiết data list + rows
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Thành công
 *       404:
 *         description: Không tìm thấy
 */
router.get('/:id', requireAuth, requireAdmin, dataListController.getById);

/**
 * @swagger
 * /api/data-lists:
 *   post:
 *     tags: [Data Lists]
 *     summary: Tạo data list mới
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, columns_config]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               columns_config:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     key: { type: string }
 *                     label: { type: string }
 *                     type: { type: string, enum: [text, number] }
 *     responses:
 *       201:
 *         description: Thành công
 */
router.post('/', requireAuth, requireAdmin, dataListController.create);

/**
 * @swagger
 * /api/data-lists/{id}:
 *   put:
 *     tags: [Data Lists]
 *     summary: Cập nhật data list
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Thành công
 */
router.put('/:id', requireAuth, requireAdmin, dataListController.update);

/**
 * @swagger
 * /api/data-lists/{id}:
 *   delete:
 *     tags: [Data Lists]
 *     summary: Xóa data list (cascade rows)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Thành công
 */
router.delete('/:id', requireAuth, requireAdmin, dataListController.remove);

/**
 * @swagger
 * /api/data-lists/{id}/rows:
 *   post:
 *     tags: [Data Lists]
 *     summary: Thêm rows (bulk)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rows:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     data: { type: object }
 *                     parent_row_id: { type: integer }
 *                     sort_order: { type: integer }
 *     responses:
 *       201:
 *         description: Thành công
 */
router.post('/:id/rows', requireAuth, requireAdmin, dataListController.addRows);

/**
 * @swagger
 * /api/data-lists/{id}/rows/{rowId}:
 *   put:
 *     tags: [Data Lists]
 *     summary: Sửa row
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: rowId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Thành công
 */
router.put('/:id/rows/:rowId', requireAuth, requireAdmin, dataListController.updateRow);

/**
 * @swagger
 * /api/data-lists/{id}/rows/{rowId}:
 *   delete:
 *     tags: [Data Lists]
 *     summary: Xóa row
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: rowId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Thành công
 */
router.delete('/:id/rows/:rowId', requireAuth, requireAdmin, dataListController.deleteRow);

/**
 * @swagger
 * /api/data-lists/{id}/export:
 *   get:
 *     tags: [Data Lists]
 *     summary: Xuất data list ra file Excel
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: File Excel
 *       404:
 *         description: Không tìm thấy
 */
router.get('/:id/export', requireAuth, requireAdmin, excelService.exportDataList);

/**
 * @swagger
 * /api/data-lists/{id}/import/preview:
 *   post:
 *     tags: [Data Lists]
 *     summary: Preview import data list từ file Excel
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Preview kết quả
 *       400:
 *         description: File không hợp lệ
 */
router.post('/:id/import/preview', requireAuth, requireAdmin, excelService.uploadMiddleware, excelService.importDataListPreview);

/**
 * @swagger
 * /api/data-lists/{id}/import/confirm:
 *   post:
 *     tags: [Data Lists]
 *     summary: Xác nhận import data list
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rows]
 *             properties:
 *               rows:
 *                 type: array
 *     responses:
 *       200:
 *         description: Import thành công
 */
router.post('/:id/import/confirm', requireAuth, requireAdmin, excelService.importDataListConfirm);

module.exports = router;
