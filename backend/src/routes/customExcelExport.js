const express = require('express');
const router = express.Router();
const { requireAuth, requireUserManager } = require('../middlewares/auth');
const { excelLimiter } = require('../middlewares/rateLimits');
const customExcelExportService = require('../services/customExcelExportService');

/**
 * @swagger
 * /api/admin/excel/custom/catalog:
 *   get:
 *     tags: [Admin - Excel]
 *     summary: Lấy danh mục trường có thể xuất trong bộ dữ liệu đề xuất
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách nhóm trường và bộ lọc
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền
 */
router.get('/catalog', requireAuth, requireUserManager, excelLimiter, customExcelExportService.getCatalog);

/**
 * @swagger
 * /api/admin/excel/custom/preview:
 *   post:
 *     tags: [Admin - Excel]
 *     summary: Xem trước dữ liệu Excel tùy chọn
 *     security:
 *       - bearerAuth: []
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
 *                   required: [id]
 *                   properties:
 *                     id:
 *                       type: string
 *                     label:
 *                       type: string
 *               filters:
 *                 type: object
 *     responses:
 *       200:
 *         description: Tổng số dòng, tiêu đề và tối đa 20 dòng xem trước
 *       400:
 *         description: Lựa chọn trường hoặc bộ lọc không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền
 */
router.post('/preview', requireAuth, requireUserManager, excelLimiter, customExcelExportService.preview);

/**
 * @swagger
 * /api/admin/excel/custom/export:
 *   post:
 *     tags: [Admin - Excel]
 *     summary: Xuất file Excel tùy chọn theo đề xuất, trạm và người liên quan
 *     description: SALES chỉ xuất đề xuất trong nhánh được phép; danh sách trường và join được kiểm tra bằng allowlist phía máy chủ.
 *     security:
 *       - bearerAuth: []
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
 *                   required: [id]
 *                   properties:
 *                     id:
 *                       type: string
 *                     label:
 *                       type: string
 *               filters:
 *                 type: object
 *     responses:
 *       200:
 *         description: File Excel
 *       400:
 *         description: Lựa chọn trường hoặc bộ lọc không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền
 *       413:
 *         description: Số dòng vượt giới hạn xuất
 */
router.post('/export', requireAuth, requireUserManager, excelLimiter, customExcelExportService.export);

module.exports = router;
