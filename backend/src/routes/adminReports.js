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

module.exports = router;
