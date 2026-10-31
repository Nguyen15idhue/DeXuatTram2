const express = require('express');
const router = express.Router();
const { requireAuth, requireChargingStationViewer, requireChargingStationEditor } = require('../middlewares/auth');
const controller = require('../controllers/chargingStationCareController');

router.use(requireAuth);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/care-logs:
 *   get:
 *     tags: [Charging Station Care]
 *     summary: Danh sách lịch sử chăm sóc khách hàng của ON trạm
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Thành công }
 */
router.get('/:id/care-logs', requireChargingStationViewer, controller.list);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/care-logs:
 *   post:
 *     tags: [Charging Station Care]
 *     summary: Thêm lịch sử chăm sóc khách hàng
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [contact_time, content]
 *             properties:
 *               employee_user_id: { type: integer, nullable: true }
 *               contact_time: { type: string, format: date-time }
 *               content: { type: string }
 *     responses:
 *       201: { description: Đã thêm }
 */
router.post('/:id/care-logs', requireChargingStationEditor, controller.create);

/**
 * @swagger
 * /api/admin/charging-stations/care-logs/{id}:
 *   put:
 *     tags: [Charging Station Care]
 *     summary: Cập nhật lịch sử chăm sóc khách hàng
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Thành công }
 */
router.put('/care-logs/:id', requireChargingStationEditor, controller.update);

/**
 * @swagger
 * /api/admin/charging-stations/care-logs/{id}:
 *   delete:
 *     tags: [Charging Station Care]
 *     summary: Xóa lịch sử chăm sóc khách hàng
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Đã xóa }
 */
router.delete('/care-logs/:id', requireChargingStationEditor, controller.remove);

module.exports = router;
