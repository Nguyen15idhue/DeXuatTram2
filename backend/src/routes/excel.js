const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin, requireUserManager } = require('../middlewares/auth');
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
  *       - in: query
  *         name: layout
  *         schema:
  *           type: string
  *           enum: [view, form]
  *         description: Kiểu xuất — `view` (phẳng theo view, mặc định) hoặc `form` (3 hàng header section/tab/field theo layout form, chỉ export)
  *       - in: query
  *         name: formId
  *         schema:
  *           type: integer
  *         description: ID form dùng khi layout=form (bỏ trống = form view mặc định)
  *       - in: query
  *         name: purpose
  *         schema:
  *           type: string
  *         description: Purpose form khi layout=form (mặc định `view`)
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
 *     description: Admin/Super xuất tất cả; Sales xuất nhánh mình (scope role tự động).
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
  *       - in: query
  *         name: layout
  *         schema:
  *           type: string
  *           enum: [view, form]
  *         description: Kiểu xuất — `view` (phẳng theo view, mặc định) hoặc `form` (3 hàng header section/tab/field theo layout form, chỉ export)
  *       - in: query
  *         name: formId
  *         schema:
  *           type: integer
  *         description: ID form dùng khi layout=form (bỏ trống = form view mặc định)
 *     responses:
 *       200:
 *         description: File Excel
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.get('/export/station_proposals', requireAuth, requireUserManager, excelService.exportProposals);

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
  *       - in: query
  *         name: layout
  *         schema:
  *           type: string
  *           enum: [view, form]
  *         description: Kiểu xuất — `view` (phẳng theo view, mặc định) hoặc `form` (3 hàng header section/tab/field theo layout form, chỉ export)
  *       - in: query
  *         name: formId
  *         schema:
  *           type: integer
  *         description: ID form dùng khi layout=form (bỏ trống = form view mặc định)
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
 *     description: Chọn bộ cột theo view. `viewId` (1 view) hoặc `viewIds` (nhiều view → 1 file nhiều sheet) hoặc `usage` (table|excel_full|excel_basic). Không truyền → view bảng mặc định.
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
 *       - in: query
 *         name: viewId
 *         schema:
 *           type: integer
 *         description: ID view (bộ cột) muốn dùng
 *       - in: query
 *         name: viewIds
 *         schema:
 *           type: string
 *         description: Danh sách ID view, phân tách dấu phẩy (vd `8,18`) → 1 file nhiều sheet
 *       - in: query
 *         name: usage
 *         schema:
 *           type: string
 *           enum: [table, excel_full, excel_basic]
 *         description: Chọn view theo loại sử dụng
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
 *     description: Tự nhận diện bộ cột theo header file (trả `data.detection`: viewId/usage/score/confident/unmatchedFileColumns/missingViewColumns). Override bằng `viewId` hoặc `usage`.
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
 *       - in: query
 *         name: viewId
 *         schema:
 *           type: integer
 *         description: Ép dùng bộ cột của view này (bỏ qua tự nhận diện)
 *       - in: query
 *         name: usage
 *         schema:
 *           type: string
 *           enum: [table, excel_full, excel_basic]
 *         description: Ép dùng bộ cột theo loại sử dụng
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
