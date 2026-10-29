const express = require('express');
const router = express.Router();
const { requireAuth, requireChargingStationViewer, requireChargingStationEditor } = require('../middlewares/auth');
const chargingStationController = require('../controllers/chargingStationController');

router.use(requireAuth);

/**
 * @swagger
 * /api/admin/charging-stations:
 *   get:
 *     tags: [Charging Stations]
 *     summary: Danh sách ON trạm theo giai đoạn
 *     description: >
 *       stage = thong-tin-chung (tất cả) | khoi-tao-hop-dong | xay-dung-ha-tang | giao-tru | lap-tru | nghiem-thu | on-tram.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: stage
 *         schema:
 *           type: string
 *           default: thong-tin-chung
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền
 */
router.get('/', requireChargingStationViewer, chargingStationController.list);

/**
 * @swagger
 * /api/admin/charging-stations/{id}:
 *   get:
 *     tags: [Charging Stations]
 *     summary: Chi tiết ON trạm (kèm ảnh nghiệm thu và nhật ký)
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
 *         description: Không tìm thấy bản ghi
 */
router.get('/:id', requireChargingStationViewer, chargingStationController.detail);

/**
 * @swagger
 * /api/admin/charging-stations/{id}:
 *   put:
 *     tags: [Charging Stations]
 *     summary: Cập nhật thông tin chung, hợp đồng, hạ tầng, thanh toán, trạng thái phụ
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
 *             properties:
 *               on_date:
 *                 type: string
 *                 format: date
 *               contract_status:
 *                 type: string
 *                 enum: [NOT, DONE, CANCELLED]
 *               infra_power_status:
 *                 type: string
 *                 enum: [NOT, DOING, DONE]
 *               infra_site_status:
 *                 type: string
 *                 enum: [NOT, DOING, DONE]
 *               payment_status:
 *                 type: string
 *                 enum: [NOT, DOING, DONE]
 *               sub_status:
 *                 type: string
 *               description:
 *                 type: string
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       403:
 *         description: Không có quyền
 */
router.put('/:id', requireChargingStationEditor, chargingStationController.update);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/status:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Chuyển trạng thái ON trạm (lùi bước bắt buộc lý do)
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
 *             required: [to_status]
 *             properties:
 *               to_status:
 *                 type: string
 *                 enum: [ONBOARDING, DELIVERING, INSTALLING, ACCEPTANCE, OPERATING]
 *               sub_status:
 *                 type: string
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Chuyển trạng thái không hợp lệ hoặc chưa đủ điều kiện
 *       403:
 *         description: Không có quyền
 */
router.post('/:id/status', requireChargingStationEditor, chargingStationController.changeStatus);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/acceptance:
 *   put:
 *     tags: [Charging Stations]
 *     summary: Cập nhật người và ngày nghiệm thu
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
 *             properties:
 *               acceptance_user_id:
 *                 type: integer
 *                 nullable: true
 *               acceptance_date:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 */
router.put('/:id/acceptance', requireChargingStationEditor, chargingStationController.updateAcceptance);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/acceptance-file:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Gắn biên bản nghiệm thu (file PDF đã upload qua /api/files/upload)
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
 *             required: [file_id]
 *             properties:
 *               file_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: File không phải PDF hoặc không tồn tại
 */
router.post('/:id/acceptance-file', requireChargingStationEditor, chargingStationController.setAcceptanceFile);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/acceptance-images:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Thêm ảnh nghiệm thu (tối đa 20 ảnh mỗi bản ghi)
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
 *             required: [file_ids]
 *             properties:
 *               file_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: File không phải ảnh hoặc vượt giới hạn
 */
router.post('/:id/acceptance-images', requireChargingStationEditor, chargingStationController.addImages);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/acceptance-images/{fileId}:
 *   delete:
 *     tags: [Charging Stations]
 *     summary: Gỡ một ảnh nghiệm thu khỏi bản ghi
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thành công
 *       404:
 *         description: Ảnh không tồn tại
 */
router.delete('/:id/acceptance-images/:fileId', requireChargingStationEditor, chargingStationController.removeImage);

module.exports = router;
