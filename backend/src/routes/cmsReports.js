const express = require('express');
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const reports = require('../services/cmsReportService');
const vehicles = require('../services/cmsVehicleSheetService');
const router = express.Router();
router.use(requireAuth, requireAdmin);

/**
 * @swagger
 * /api/admin/cms-reports/status:
 *   get:
 *     tags: [Admin - CMS Reports]
 *     summary: Cấu hình công khai và tiến độ thống kê CMS trong bộ nhớ (ADMIN/SUPER_ADMIN)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lịch chạy, link Sheet, cấu hình tab raw và tiến độ theo tab; không trả key hoặc dữ liệu từng phiên
 *       403:
 *         description: Không có quyền quản trị
 */
router.get('/status', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: reports.getStatus() });
});

/**
 * @swagger
 * /api/admin/cms-reports/run:
 *   post:
 *     tags: [Admin - CMS Reports]
 *     summary: Đồng bộ tổng hợp theo ngày và tab raw theo mã phiên nếu đã bật, không lưu database
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [from, to]
 *             properties:
 *               from:
 *                 type: string
 *                 format: date
 *               to:
 *                 type: string
 *                 format: date
 *               rawOnly:
 *                 type: boolean
 *                 description: Chỉ ghi tab Phien_sac_raw, lấy tối đa đến ngày hiện tại theo giờ Việt Nam; yêu cầu đã bật CMS_RAW_SHEET_ENABLED.
 *     responses:
 *       202:
 *         description: Đã bắt đầu lượt chạy nền
 *       400:
 *         description: Ngày không hợp lệ hoặc chưa kết thúc
 *       403:
 *         description: Chỉ ADMIN/SUPER_ADMIN
 *       409:
 *         description: Đang có lượt chạy khác
 *       503:
 *         description: Thiếu cấu hình CMS hoặc Google Sheet
 */
router.post('/run', (req, res) => {
  try {
    const run = reports.startRun({ from: req.body?.from, to: req.body?.to, rawOnly: req.body?.rawOnly });
    res.status(202).json({ success: true, data: { id: run.id }, message: 'Đã bắt đầu thống kê CMS' });
  } catch (cause) {
    console.error('[CmsReport] start:', cause.message);
    res.status(cause.statusCode || 500).json({ success: false, message: cause.message });
  }
});

/**
 * @swagger
 * /api/admin/cms-reports/vehicles/run:
 *   post:
 *     tags: [Admin - CMS Reports]
 *     summary: Đồng bộ danh sách xe theo mã xe, giữ giá trị cũ khi CMS không có dữ liệu
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               from:
 *                 type: string
 *                 format: date
 *               to:
 *                 type: string
 *                 format: date
 *               all:
 *                 type: boolean
 *                 description: Lấy toàn bộ xe, bỏ qua khoảng ngày.
 *     responses:
 *       200:
 *         description: Số xe đọc, lọc, thêm mới, cập nhật và không đổi
 *       400:
 *         description: Khoảng ngày không hợp lệ
 *       403:
 *         description: Chỉ ADMIN/SUPER_ADMIN
 *       409:
 *         description: Đang chạy đồng bộ hoặc header Sheet không khớp
 *       502:
 *         description: Lỗi CMS hoặc Google Sheet
 *       503:
 *         description: Thiếu cấu hình
 */
router.post('/vehicles/run', async (req, res) => {
  try {
    const result = await vehicles.runVehicleSync({
      from: req.body?.from,
      to: req.body?.to,
      all: req.body?.all === true,
    });
    res.status(200).json({ success: true, data: result, message: 'Đã đồng bộ danh sách xe' });
  } catch (cause) {
    console.error('[CmsVehicle] run:', cause.message);
    res.status(cause.statusCode || 500).json({ success: false, message: cause.message });
  }
});

module.exports = router;
