const router = require('express').Router();
const { requireAuth, requireChargingStationViewer } = require('../middlewares/auth');
const controller = require('../controllers/chargingStationShippingController');
router.use(requireAuth, requireChargingStationViewer);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/fulfillment:
 *   get:
 *     tags: [Charging Stations]
 *     summary: Đối soát trụ chốt, xuất, nhận, hoàn kho và tiến độ ON
 *     description: pole_requirements gộp nhu cầu theo loại trụ không phân biệt mô hình; shipping_options liệt kê từng cặp loại trụ và nhà cung cấp còn tồn.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Các dòng chốt và toàn bộ đợt giao }
 *       403: { description: Ngoài phạm vi }
 * /api/admin/charging-stations/{id}/shipments:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Xuất một đợt trụ theo số lượng còn lại
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [request_id, carrier_id, export_date, items]
 *             properties:
 *               request_id: { type: string }
 *               carrier_id: { type: integer }
 *               export_date: { type: string, format: date }
 *               transport_code: { type: string }
 *               total_amount: { type: number, minimum: 0 }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [pole_id, supplier_id, quantity]
 *                   properties:
 *                     pole_id: { type: integer }
 *                     supplier_id: { type: integer }
 *                     quantity: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: Đã xuất kho; retry cùng request_id không xuất lại }
 *       409: { description: Vượt số chốt, tồn kho hoặc cần đối soát }
 * /api/admin/charging-stations/{id}/shipments/{exportId}/{action}:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Nhận từng phần, yêu cầu hoàn, xác nhận hoàn kho hoặc báo giao lỗi
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: exportId, required: true, schema: { type: integer } }
 *       - in: path
 *         name: action
 *         required: true
 *         schema: { type: string, enum: [receive, request-return, confirm-return, fail] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [request_id]
 *             properties:
 *               request_id: { type: string }
 *               reason: { type: string }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [item_id, quantity]
 *                   properties:
 *                     item_id: { type: integer }
 *                     quantity: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: Đã cập nhật đúng số lượng; cộng tồn chỉ khi xác nhận nhận hoàn }
 *       400: { description: Thiếu lý do hoặc số lượng không hợp lệ }
 *       403: { description: Không có quyền }
 *       409: { description: Trạng thái hoặc số lượng đã thay đổi }
 */
router.get('/:id/fulfillment', controller.summary);
router.post('/:id/shipments', controller.create);
/**
 * @swagger
 * /api/admin/charging-stations/{id}/shipments/{exportId}/status:
 *   put:
 *     tags: [Charging Stations]
 *     summary: Nhận hoặc hoàn toàn bộ số còn lại của một đơn vận chuyển
 *     description: >
 *       Back Office hoặc SUPER_ADMIN. SHIPPING/PENDING chuyển DELIVERED hoặc RETURN_PENDING;
 *       DELIVERED/FAILED chuyển RETURN_PENDING; RETURN_PENDING chỉ chuyển RETURNED.
 *       Chặn hoàn khi bất kỳ phần trụ nào đã bắt đầu lắp/nghiệm thu/ON.
 *       Chờ hoàn khóa triển khai; xác nhận hoàn mới cộng kho, giữ lịch sử phần trụ đã trả.
 *       Ghi chú bắt buộc khi yêu cầu hoặc xác nhận hoàn. Retry cùng request_id không cộng kho lặp.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: exportId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [request_id, status, expected_status]
 *             properties:
 *               request_id: { type: string, maxLength: 100 }
 *               status: { type: string, enum: [DELIVERED, RETURN_PENDING, RETURNED] }
 *               expected_status: { type: string, enum: [PENDING, SHIPPING, DELIVERED, FAILED, RETURN_PENDING] }
 *               reason: { type: string, maxLength: 5000 }
 *     responses:
 *       200: { description: Cập nhật nguyên tử toàn bộ đơn }
 *       400: { description: Thiếu thông tin hoặc lý do }
 *       403: { description: Không có quyền }
 *       409: { description: Sai bước, đã bắt đầu lắp hoặc dữ liệu đã thay đổi }
 */
router.put('/:id/shipments/:exportId/status', controller.status);
router.post('/:id/shipments/:exportId/receive', controller.receive);
router.post('/:id/shipments/:exportId/request-return', controller.requestReturn);
router.post('/:id/shipments/:exportId/confirm-return', controller.confirmReturn);
router.post('/:id/shipments/:exportId/fail', controller.fail);
module.exports = router;
