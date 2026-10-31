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
 *       stage = thong-tin-chung | khoi-tao-hop-dong (tab = need|completed|all) | xay-dung-ha-tang (tab = need|completed|all) | giao-tru | lap-tru | nghiem-thu | on-tram.
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
 *         name: tab
 *         schema:
 *           type: string
 *           enum: [need, completed, all]
 *           default: need
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
 * /api/admin/charging-stations/task-counts:
 *   get:
 *     tags: [Charging Stations]
 *     summary: Đếm task ON trạm theo phạm vi và quyền của người dùng
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Số task cần thực hiện theo từng bước
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền xem ON trạm
 */
router.get('/task-counts', requireChargingStationViewer, chargingStationController.taskCounts);

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
 *     summary: Cập nhật thông tin chung, thanh toán và trạng thái phụ
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
 * /api/admin/charging-stations/{id}/contract/start:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Bắt đầu ký hợp đồng (Back Office)
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
 *         description: Đã chuyển hợp đồng sang Đang ký
 *       400:
 *         description: Trạng thái hiện tại không cho phép bắt đầu ký
 *       403:
 *         description: Không thuộc Back Office
 */
router.post('/:id/contract/start', requireChargingStationViewer, chargingStationController.startContract);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/contract/complete:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Gắn file hợp đồng và hoàn tất thủ tục (Back Office)
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
 *         description: File hợp đồng đã lưu, contract_status chuyển DONE và payment_status chuyển DOING; trạm tự chuyển sang Giao trụ nếu đủ điều kiện
 *       400:
 *         description: Trạng thái hoặc file không hợp lệ
 *       403:
 *         description: Không thuộc Back Office
 */
router.post('/:id/contract/complete', requireChargingStationViewer, chargingStationController.completeContract);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/infrastructure/{type}/start:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Bắt đầu hoàn thiện một hạng mục hạ tầng
 *     description: Chỉ Back Office hoặc SUPER_ADMIN; type là power hoặc site.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [power, site]
 *     responses:
 *       200:
 *         description: Hạng mục hạ tầng đã chuyển sang DOING
 *       400:
 *         description: Trạng thái hiện tại không cho phép bắt đầu
 *       403:
 *         description: Không thuộc Back Office
 */
router.post('/:id/infrastructure/:type/start', requireChargingStationViewer, chargingStationController.startInfrastructure);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/infrastructure/{type}/complete:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Xác nhận hoàn thành một hạng mục hạ tầng
 *     description: Chỉ Back Office hoặc SUPER_ADMIN; type là power hoặc site. Nếu đủ điều kiện, ON trạm tự chuyển sang Giao trụ.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [power, site]
 *     responses:
 *       200:
 *         description: Hạng mục hạ tầng đã hoàn thành
 *       400:
 *         description: Trạng thái hiện tại không cho phép hoàn tất
 *       403:
 *         description: Không thuộc Back Office
 */
router.post('/:id/infrastructure/:type/complete', requireChargingStationViewer, chargingStationController.completeInfrastructure);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/delivery/early-request:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Đề xuất giao trụ sớm
 *     description: Người đề xuất hoặc người quản lý trong phạm vi được xem có thể yêu cầu giao sớm; yêu cầu phải có ngày mong muốn và lý do.
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
 *             required: [desired_delivery_date, reason]
 *             properties:
 *               desired_delivery_date: { type: string, format: date }
 *               reason: { type: string }
 *     responses:
 *       200: { description: Đã gửi đề xuất giao trụ sớm }
 *       403: { description: Không thuộc phạm vi đề xuất }
 */
router.post('/:id/delivery/early-request', requireChargingStationViewer, chargingStationController.requestEarlyDelivery);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/delivery/export:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Tạo phiếu xuất trụ cho ON trạm
 *     description: Chỉ Back Office hoặc SUPER_ADMIN; danh sách trụ và số lượng lấy từ đề xuất, trừ kho nguyên tử cùng cập nhật trạng thái trạm.
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
 *             required: [carrier, transport_code, transport_status, total_amount]
 *             properties:
 *               carrier: { type: string }
 *               transport_code: { type: string }
 *               transport_status: { type: string, enum: [PENDING, SHIPPING], default: SHIPPING }
 *               total_amount: { type: number, minimum: 0 }
 *     responses:
 *       200: { description: Đã tạo phiếu xuất và trừ tồn kho }
 *       400: { description: Dữ liệu hoặc tồn kho không hợp lệ }
 *       403: { description: Không thuộc Back Office }
 */
router.post('/:id/delivery/export', requireChargingStationViewer, chargingStationController.createDeliveryExport);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/delivery/confirm:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Xác nhận trụ đã giao đến nơi
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Chuyển trạm sang INSTALLING / NOT_INSTALLED và thông báo Setup/Vận hành }
 *       403: { description: Không thuộc Back Office }
 */
router.post('/:id/delivery/confirm', requireChargingStationViewer, chargingStationController.confirmDelivery);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/installation/start:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Bắt đầu lắp đặt
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Chuyển trạng thái phụ sang INSTALLING }
 *       403: { description: Không thuộc Phòng Setup và Vận hành }
 */
router.post('/:id/installation/start', requireChargingStationViewer, chargingStationController.startInstallation);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/installation/complete:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Xác nhận lắp đặt hoàn tất
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Chuyển trạm sang ACCEPTANCE / NOT_ACCEPTED }
 *       403: { description: Không thuộc Phòng Setup và Vận hành }
 */
router.post('/:id/installation/complete', requireChargingStationViewer, chargingStationController.completeInstallation);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/acceptance/result:
 *   put:
 *     tags: [Charging Stations]
 *     summary: Cập nhật kết quả nghiệm thu
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
 *             required: [result]
 *             properties:
 *               result: { type: string, enum: [ACCEPT_FAILED, ACCEPT_PASSED] }
 *     responses:
 *       200: { description: Đã cập nhật kết quả nghiệm thu }
 *       400: { description: Thiếu biên bản nghiệm thu hoặc trạng thái không phù hợp }
 *       403: { description: Không thuộc Phòng Setup và Vận hành }
 */
router.put('/:id/acceptance/result', requireChargingStationViewer, chargingStationController.updateAcceptanceResult);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/configuration/complete:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Hoàn tất cấu hình và xác nhận ON trạm
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
 *             required: [cms_station_code, on_date]
 *             properties:
 *               cms_station_code: { type: string }
 *               on_date: { type: string, format: date }
 *     responses:
 *       200: { description: Trạm và đề xuất được chuyển sang Hoạt động }
 *       400: { description: Dữ liệu hoặc trạng thái không hợp lệ }
 *       403: { description: Không thuộc Phòng Setup và Vận hành }
 */
router.post('/:id/configuration/complete', requireChargingStationViewer, chargingStationController.completeConfiguration);

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
router.put('/:id/acceptance', requireChargingStationViewer, chargingStationController.updateAcceptance);

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
router.post('/:id/acceptance-file', requireChargingStationViewer, chargingStationController.setAcceptanceFile);

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
router.post('/:id/acceptance-images', requireChargingStationViewer, chargingStationController.addImages);

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
router.delete('/:id/acceptance-images/:fileId', requireChargingStationViewer, chargingStationController.removeImage);

module.exports = router;
router.get('/:id/committed-export-items', requireChargingStationViewer, chargingStationController.committedExportItems);
