const express = require('express');
const router = express.Router();
const { requireAuth, requireReportViewer, requireReportConfigurator } = require('../middlewares/auth');
const adminReportController = require('../controllers/adminReportController');

/**
 * @swagger
 * /api/admin/reports/pipeline:
 *   get:
 *     tags: [Reports]
 *     summary: Báo cáo pipeline tổng hợp (1 API call)
 *     description: |
 *       Trả toàn bộ dataset cho tab báo cáo: funnel 6 mốc, lead theo
 *       stage/classification/source/tỉnh/vùng/phòng ban/người phụ trách,
 *       proposal theo status, conversion, thời gian trung bình, pipeline theo
 *       ngày/tháng, kẹt hạn, lead chưa phân công, proposal không gắn lead,
 *       station không gắn proposal, lỗi đồng bộ. Scope theo role
 *       (SALES theo nhánh được giao; CTV/NPP bị 403). Metric whitelist theo
 *       registry, tên lạ trả 400. Cache in-process 45s theo user + filter.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date_from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *       - in: query
 *         name: stage
 *         schema:
 *           type: string
 *       - in: query
 *         name: assigned_user_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: province
 *         schema:
 *           type: string
 *       - in: query
 *         name: metrics
 *         schema:
 *           type: string
 *         description: Danh sách metric phân tách dấu phẩy trong registry (mặc định trả tất cả)
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Metric/filter không hợp lệ
 *       403:
 *         description: Không có quyền truy cập
 */
router.get('/pipeline', requireAuth, requireReportViewer, adminReportController.getPipeline);

/**
 * @swagger
 * /api/admin/reports/metrics:
 *   get:
 *     tags: [Reports]
 *     summary: Danh sách metric trong registry
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 *       403:
 *         description: Không có quyền truy cập
 */
router.get('/metrics', requireAuth, requireReportViewer, adminReportController.getMetrics);

/**
 * @swagger
 * /api/admin/reports/lead/{id}:
 *   get:
 *     tags: [Reports]
 *     summary: Báo cáo chi tiết 1 Lead (Lead 360)
 *     description: |
 *       Một API call trả header, durations, CSKH/TVBH, proposals kèm gương
 *       process 1Office, stations kèm gương ON trạm, timeline, syncHealth,
 *       counts. Ngoài scope Lead → 403 (không 404 để chống oracle IDOR).
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
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy Lead
 */
router.get('/lead/:id', requireAuth, requireReportViewer, adminReportController.getLead360);

/**
 * @swagger
 * /api/admin/reports/export/lead/{id}:
 *   get:
 *     tags: [Reports]
 *     summary: Xuất CSV báo cáo Lead 360 (scope theo role)
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
 *         description: File CSV
 *       403:
 *         description: Ngoài scope
 */
router.get('/export/lead/:id', requireAuth, requireReportViewer, adminReportController.exportLead360);

/**
 * @swagger
 * /api/admin/reports/builder/export:
 *   post:
 *     tags: [Reports]
 *     summary: Xuất CSV dữ liệu 1 widget builder (scope theo role)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [widget]
 *             properties:
 *               widget:
 *                 type: object
 *     responses:
 *       200:
 *         description: File CSV
 *       400:
 *         description: Widget ngoài catalog
 *       403:
 *         description: Không có quyền
 */
router.post('/builder/export', requireAuth, requireReportViewer, adminReportController.exportBuilderWidget);

/**
 * @swagger
 * /api/admin/reports/config:
 *   get:
 *     tags: [Reports]
 *     summary: Lấy layout dashboard báo cáo
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dashboard
 *         schema:
 *           type: string
 *           default: pipeline
 *     responses:
 *       200:
 *         description: Thành công
 *       403:
 *         description: Không có quyền truy cập
 */
router.get('/config', requireAuth, requireReportViewer, adminReportController.getConfig);

/**
 * @swagger
 * /api/admin/reports/config:
 *   put:
 *     tags: [Reports]
 *     summary: Lưu layout dashboard báo cáo (chỉ SUPER_ADMIN)
 *     description: |
 *       Chỉ cấu hình layout (metric trong registry, thứ tự, kích thước,
 *       chart type whitelist, tiêu đề). Metric lạ trả 400. Không cấu hình SQL.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dashboard
 *         schema:
 *           type: string
 *           default: pipeline
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [widgets]
 *             properties:
 *               widgets:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [metric]
 *                   properties:
 *                     metric:
 *                       type: string
 *                     title:
 *                       type: string
 *                     chart:
 *                       type: string
 *                       enum: [kpi, bar, line, pie, funnel, table]
 *                     size:
 *                       type: string
 *                       enum: [sm, md, lg, full]
 *                     order:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Metric/chart/size không hợp lệ
 *       403:
 *         description: Không có quyền truy cập
 */
router.put('/config', requireAuth, requireReportConfigurator, adminReportController.updateConfig);

/**
 * @swagger
 * /api/admin/reports/builder/datasets:
 *   get:
 *     tags: [Reports]
 *     summary: Catalog dataset cho mini-builder (dimension/metric whitelist)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 *       403:
 *         description: Không có quyền truy cập
 */
router.get('/builder/datasets', requireAuth, requireReportViewer, adminReportController.getBuilderDatasets);

/**
 * @swagger
 * /api/admin/reports/builder/preview:
 *   post:
 *     tags: [Reports]
 *     summary: Xem trước widget (biên dịch thành SQL mẫu whitelist + scope)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [widget]
 *             properties:
 *               widget:
 *                 type: object
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Dataset/dimension/metric/filter ngoài catalog
 *       403:
 *         description: Không có quyền truy cập
 */
router.post('/builder/preview', requireAuth, requireReportViewer, adminReportController.previewBuilderWidget);

/**
 * @swagger
 * /api/admin/reports/builder/dashboards:
 *   get:
 *     tags: [Reports]
 *     summary: Danh sách dashboard tự dựng
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/builder/dashboards', requireAuth, requireReportViewer, adminReportController.listBuilderDashboards);

/**
 * @swagger
 * /api/admin/reports/builder/dashboards:
 *   post:
 *     tags: [Reports]
 *     summary: Tạo dashboard tự dựng (chỉ SUPER_ADMIN)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, widgets]
 *             properties:
 *               name:
 *                 type: string
 *               widgets:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Widget ngoài catalog
 *       403:
 *         description: Không có quyền truy cập
 */
router.post('/builder/dashboards', requireAuth, requireReportConfigurator, adminReportController.createBuilderDashboard);

/**
 * @swagger
 * /api/admin/reports/builder/dashboards/{id}:
 *   get:
 *     tags: [Reports]
 *     summary: Chi tiết dashboard tự dựng
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
router.get('/builder/dashboards/:id', requireAuth, requireReportViewer, adminReportController.getBuilderDashboard);

/**
 * @swagger
 * /api/admin/reports/builder/dashboards/{id}:
 *   put:
 *     tags: [Reports]
 *     summary: Sửa dashboard tự dựng (chỉ SUPER_ADMIN)
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
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Widget ngoài catalog
 *       403:
 *         description: Không có quyền truy cập
 */
router.put('/builder/dashboards/:id', requireAuth, requireReportConfigurator, adminReportController.updateBuilderDashboard);

/**
 * @swagger
 * /api/admin/reports/builder/dashboards/{id}:
 *   delete:
 *     tags: [Reports]
 *     summary: Xóa dashboard tự dựng (chỉ SUPER_ADMIN)
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
 *       403:
 *         description: Không có quyền truy cập
 */
router.delete('/builder/dashboards/:id', requireAuth, requireReportConfigurator, adminReportController.deleteBuilderDashboard);

module.exports = router;
