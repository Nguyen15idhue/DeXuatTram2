const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const excelService = require('../services/excelService');

/**
 * @swagger
 * /api/admin/excel/export/stations:
 *   get:
 *     tags: [Admin - Excel]
 *     summary: Xuất danh sách trạm ra file Excel (dynamic columns)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Lọc theo tên hoặc địa chỉ (bỏ trống = tất cả)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, DEPLOYING]
 *         description: Lọc theo trạng thái (bỏ trống = tất cả)
 *     responses:
 *       200:
 *         description: File Excel
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.get('/export/stations', requireAuth, requireAdmin, excelService.exportStations);

/**
 * @swagger
 * /api/admin/excel/export/station_proposals:
 *   get:
 *     tags: [Admin - Excel]
 *     summary: Xuất danh sách đề xuất ra file Excel (dynamic columns)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Lọc theo tên, địa chỉ, người tạo (bỏ trống = tất cả)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, REVIEWING, APPROVED, REJECTED]
 *         description: Lọc theo trạng thái (bỏ trống = tất cả)
 *     responses:
 *       200:
 *         description: File Excel
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.get('/export/station_proposals', requireAuth, requireAdmin, excelService.exportProposals);

/**
 * @swagger
 * /api/admin/excel/export/users:
 *   get:
 *     tags: [Admin - Excel]
 *     summary: Xuất danh sách người dùng ra file Excel (dynamic columns)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Lọc theo tên, email, SĐT (bỏ trống = tất cả)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, LOCKED]
 *         description: Lọc theo trạng thái (bỏ trống = tất cả)
 *     responses:
 *       200:
 *         description: File Excel
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.get('/export/users', requireAuth, requireAdmin, excelService.exportUsers);

/**
 * @swagger
 * /api/admin/excel/template:
 *   get:
 *     tags: [Admin - Excel]
 *     summary: Tải file template import
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entity
 *         required: true
 *         schema:
 *           type: string
 *           enum: [stations, users, station_proposals]
 *         description: Entity name
 *     responses:
 *       200:
 *         description: File Excel template
 *       400:
 *         description: Entity không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.get('/template', requireAuth, requireAdmin, excelService.getTemplate);

/**
 * @swagger
 * /api/admin/excel/import/preview:
 *   post:
 *     tags: [Admin - Excel]
 *     summary: Preview import từ file Excel
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entity
 *         required: true
 *         schema:
 *           type: string
 *           enum: [stations, users, station_proposals]
 *         description: Entity name
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
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.post('/import/preview', requireAuth, requireAdmin, excelService.uploadMiddleware, excelService.importPreview);

/**
 * @swagger
 * /api/admin/excel/import/confirm:
 *   post:
 *     tags: [Admin - Excel]
 *     summary: Xác nhận import
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entity, rows]
 *             properties:
 *               entity:
 *                 type: string
 *                 enum: [stations, users, station_proposals]
 *               rows:
 *                 type: array
 *     responses:
 *       200:
 *         description: Import thành công
 *       400:
 *         description: Import thất bại
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.post('/import/confirm', requireAuth, requireAdmin, excelService.importConfirm);

/**
 * @swagger
 * /api/admin/excel/export/duplicates:
 *   post:
 *     tags: [Admin - Excel]
 *     summary: Xuất file Excel 3 sheets cho kết quả check trùng
 *     description: Sheet ketqua (Bên A, Bên B, Khoảng cách) + sheet Ben A + sheet Ben B (full columns như export tất cả).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               min_m:
 *                 type: number
 *                 default: 200
 *               max_m:
 *                 type: number
 *                 default: 2000
 *     responses:
 *       200:
 *         description: File Excel
 *       400:
 *         description: Tham số không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.post('/export/duplicates', requireAuth, requireAdmin, (req, res) => excelService.exportDuplicates(req, res));

module.exports = router;
