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
 *             required: [request_id, carrier, transport_code, total_amount, items]
 *             properties:
 *               request_id: { type: string }
 *               carrier: { type: string }
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
router.post('/:id/shipments/:exportId/receive', controller.receive);
router.post('/:id/shipments/:exportId/request-return', controller.requestReturn);
router.post('/:id/shipments/:exportId/confirm-return', controller.confirmReturn);
router.post('/:id/shipments/:exportId/fail', controller.fail);
module.exports = router;
