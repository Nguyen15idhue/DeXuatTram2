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
 *       403: { description: Chỉ Back Office hoặc quản trị viên }
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
 *             required: [invoice_type, amount]
 *             properties:
 *               invoice_type: { type: string, enum: [DEPOSIT, REFUND, PAYMENT] }
 *               amount: { type: number, exclusiveMinimum: 0 }
 *               content: { type: string }
 *               evidence_file_id: { type: integer, nullable: true }
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
