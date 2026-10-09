const express = require('express');
const router = express.Router();
const { requireAuth, requireReportViewer } = require('../middlewares/auth');
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

module.exports = router;
