const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const chargingFinanceController = require('../controllers/chargingFinanceController');

router.use(requireAuth);

/**
 * @swagger
 * /api/admin/charging-finance/stations:
 *   get:
 *     tags: [Charging Finance]
 *     summary: Danh sách ON trạm theo trạng thái tài chính
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: query
 *         name: tab
 *         schema: { type: string, enum: [need, completed, all], default: need }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Thành công }
 *       403: { description: Chỉ Phòng Tài chính, Back Office hoặc quản trị viên }
 */
router.get('/stations', chargingFinanceController.listStations);

/**
 * @swagger
 * /api/admin/charging-finance/invoices:
 *   get:
 *     tags: [Charging Finance]
 *     summary: Danh sách hóa đơn của một ON trạm
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: query
 *         name: charging_station_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Thành công }
 *       403: { description: Không có quyền xem tài chính ON trạm }
 */
router.get('/invoices', chargingFinanceController.listInvoices);

/**
 * @swagger
 * /api/admin/charging-finance/stations/{stationId}/invoices:
 *   post:
 *     tags: [Charging Finance]
 *     summary: Ghi nhận hóa đơn ON trạm
 *     description: >
 *       DEPOSIT ghi nhận ngay deposit_status=RECEIVED; PAYMENT yêu cầu đã nhận cọc và đưa payment_status từ NOT sang DOING;
 *       PAYMENT/REFUND bắt buộc có hóa đơn cọc. REFUND chỉ cho mô hình LK, toàn bộ trụ đã ON và đã xác nhận cần hoàn cọc.
 *       Bằng chứng ảnh/PDF bắt buộc. Cờ cần hoàn cọc chỉ sửa khi tạo DEPOSIT, khóa khi có REFUND.
 *       Mô hình Tự đầu tư không thu cọc/thanh toán. Tiền ròng = cọc + thanh toán - hoàn cọc.
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: stationId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [invoice_type, amount, evidence_file_id]
 *             properties:
 *               invoice_type: { type: string, enum: [DEPOSIT, REFUND, PAYMENT] }
 *               amount: { type: number, exclusiveMinimum: 0 }
 *               content: { type: string }
 *               evidence_file_id: { type: integer }
 *               deposit_refund_required: { type: boolean, description: Chỉ gửi với DEPOSIT }
 *     responses:
 *       201: { description: Đã ghi nhận hóa đơn }
 *       400: { description: Dữ liệu hóa đơn không hợp lệ }
 *       403: { description: Chỉ Back Office hoặc quản trị viên }
 */
router.post('/stations/:stationId/invoices', chargingFinanceController.createInvoice);

/**
 * @swagger
 * /api/admin/charging-finance/stations/{stationId}/payment-status:
 *   put:
 *     tags: [Charging Finance]
 *     summary: Cập nhật trạng thái tài chính ON trạm
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: stationId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [payment_status, reason]
 *             properties:
 *               payment_status: { type: string, enum: [DOING, DONE] }
 *               reason: { type: string }
 *     responses:
 *       200: { description: Đã cập nhật trạng thái tài chính }
 *       400: { description: Chuyển trạng thái không hợp lệ }
 *       403: { description: Chỉ Back Office hoặc quản trị viên }
 */
router.put('/stations/:stationId/payment-status', chargingFinanceController.updatePaymentStatus);

module.exports = router;
