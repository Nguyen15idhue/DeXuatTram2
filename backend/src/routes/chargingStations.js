const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin, requireChargingStationViewer } = require('../middlewares/auth');
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
 * /api/admin/charging-stations/{id}/delete-preview:
 *   get:
 *     tags: [Charging Stations]
 *     summary: Xem trước dữ liệu bị xóa và tồn kho được rollback
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
 *         description: Tóm tắt phiếu xuất, hóa đơn, phiếu nhập giữ lại và lượng trụ cộng kho
 *       403:
 *         description: Chỉ SUPER_ADMIN được xem trước thao tác xóa
 *       409:
 *         description: Dữ liệu tồn kho không thể rollback an toàn
 */
router.get('/:id/delete-preview', requireSuperAdmin, chargingStationController.deletePreview);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/delete:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Xóa ON trạm và rollback các phiếu liên quan
 *     description: Chỉ SUPER_ADMIN. Phiếu xuất và hóa đơn bị xóa; tồn kho được cộng lại theo số lượng xuất ròng; phiếu nhập giữ lại và bỏ liên kết ON trạm; đề xuất giữ nguyên trạng thái.
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
 *             required: [reason, preview_token]
 *             properties:
 *               reason:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 5000
 *               preview_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Đã xóa ON trạm trong một transaction
 *       403:
 *         description: Chỉ SUPER_ADMIN được xóa
 *       409:
 *         description: Dữ liệu thay đổi sau khi xem trước hoặc tồn kho không thể rollback an toàn
 */
router.post('/:id/delete', requireSuperAdmin, chargingStationController.remove);

/**
 * @swagger
 * /api/admin/charging-stations/from-proposal/{proposalId}:
 *   post:
 *     tags: [Charging Stations]
 *     summary: SUPER_ADMIN tạo trực tiếp ON trạm từ đề xuất
 *     description: Bỏ qua các bước luồng đề xuất, chuyển đề xuất sang DEPLOYING và tạo charging_stations ở ONBOARDING. Không cho phép đề xuất CANCELLED, ARCHIVED hoặc PAUSED.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: proposalId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 5000
 *     responses:
 *       201:
 *         description: Đã tạo bản ghi ON trạm
 *       403:
 *         description: Chỉ SUPER_ADMIN được sử dụng
 *       409:
 *         description: Đề xuất không thể chuyển trực tiếp hoặc đã ở trạng thái kết thúc
 */
router.post('/from-proposal/:proposalId', requireSuperAdmin, chargingStationController.createDirectFromProposal);

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
 * /api/admin/charging-stations/{id}/cancel:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Hủy ON trạm và lưu trữ đề xuất liên kết
 *     description: Chỉ SUPER_ADMIN, ADMIN hoặc GĐTTKD trong phạm vi quản lý.
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
 *         description: ON trạm đã hủy; đề xuất được lưu trữ
 *       403:
 *         description: Không có quyền hoặc ngoài phạm vi
 *       409:
 *         description: Trạng thái hiện tại không thể hủy
 */
router.post('/:id/cancel', requireChargingStationViewer, chargingStationController.cancelOnStation);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/restore:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Khôi phục ON trạm bị hủy thủ công
 *     description: Chỉ SUPER_ADMIN, ADMIN hoặc GĐTTKD trong phạm vi quản lý; khôi phục cả trạng thái đề xuất đã lưu.
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
 *         description: ON trạm và đề xuất đã được khôi phục
 *       403:
 *         description: Không có quyền hoặc ngoài phạm vi
 *       409:
 *         description: Không thể khôi phục bản ghi này
 */
router.post('/:id/restore', requireChargingStationViewer, chargingStationController.restoreOnStation);

/**
 * @swagger
 * /api/admin/charging-stations/{id}:
 *   put:
 *     tags: [Charging Stations]
 *     summary: SUPER_ADMIN điều chỉnh toàn bộ hồ sơ ON trạm
 *     description: Whitelist thông tin, ngày/hạn, trạng thái hợp đồng/hạ tầng/tài chính/cọc, trạng thái phụ, người nghiệm thu và tài liệu. Không sửa ID/mã trạm, đề xuất nguồn, giao dịch kho, hóa đơn hay nhật ký. Ghi nguồn admin_override; không tạo chứng từ khi ghi đè trạng thái. expected_token lấy từ chi tiết.
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
 *             required: [expected_token, reason]
 *             properties:
 *               expected_token: { type: string }
 *               reason: { type: string, minLength: 3, maxLength: 5000 }
 *               contract_status: { type: string, enum: [NOT, DOING, DONE, CANCELLED] }
 *               infra_power_status: { type: string, enum: [NOT, DOING, DONE] }
 *               infra_site_status: { type: string, enum: [NOT, DOING, DONE] }
 *               payment_status: { type: string, enum: [NOT_REQUIRED, NOT, DOING, DONE] }
 *               deposit_status: { type: string, enum: [NOT_REQUIRED, NOT_RECEIVED, RECEIVED, REFUND_PENDING, REFUNDED] }
 *               contract_file_ids: { type: array, items: { type: integer } }
 *               image_ids: { type: array, items: { type: integer } }
 *               acceptance_file_id: { type: integer, nullable: true }
 *               deployment_updates:
 *                 type: array
 *                 description: SUPER_ADMIN sửa hồ sơ nghiệm thu đã đạt hoặc ngày/ghi chú phần trụ đã ON; cùng transaction với hồ sơ trạm, bắt buộc reason chung.
 *                 items:
 *                   type: object
 *                   required: [id, expected_version]
 *                   properties:
 *                     id: { type: integer }
 *                     expected_version: { type: integer, minimum: 0 }
 *                     on_date: { type: string, format: date }
 *                     on_note: { type: string, nullable: true, maxLength: 5000 }
 *                     equipment:
 *                       type: object
 *                       required: [file_id, image_ids]
 *                       properties:
 *                         file_id: { type: integer }
 *                         image_ids: { type: array, minItems: 2, items: { type: integer } }
 *                         note: { type: string, nullable: true }
 *                     infrastructure:
 *                       type: object
 *                       required: [file_id, image_ids]
 *                       properties:
 *                         file_id: { type: integer }
 *                         image_ids: { type: array, minItems: 2, items: { type: integer } }
 *                         note: { type: string, nullable: true }
 *               cms_station_code: { type: string }
 *               on_date:
 *                 type: string
 *                 format: date
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
router.put('/:id', requireSuperAdmin, chargingStationController.update);

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
 *             required: [file_ids, contract_effective_date, contract_expiry_date]
 *             properties:
 *               file_ids:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: integer
 *               contract_effective_date:
 *                 type: string
 *                 format: date
 *               contract_expiry_date:
 *                 type: string
 *                 format: date
 *                 description: Phải sau ngày hiệu lực hợp đồng
 *               contract_note:
 *                 type: string
 *     responses:
 *       200:
 *         description: File hợp đồng đã lưu, contract_status chuyển DONE; trạm tự chuyển sang Giao trụ nếu đủ điều kiện theo mô hình đầu tư (TĐT không cần cọc/thanh toán)
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
 * /api/admin/charging-stations/{id}/infrastructure/{type}/status:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Cập nhật trạng thái, ngày và ghi chú hạ tầng
 *     description: Back Office chuyển tiến tuần tự; SUPER_ADMIN chọn tùy ý. Không tự lùi tiến độ giao trụ.
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status, expected_status, date]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [NOT, DOING, DONE]
 *               expected_status:
 *                 type: string
 *                 enum: [NOT, DOING, DONE]
 *               date:
 *                 type: string
 *                 format: date
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Đã lưu trạng thái, ngày, ghi chú và nhật ký
 *       400:
 *         description: Dữ liệu hoặc chuyển trạng thái không hợp lệ
 *       403:
 *         description: Không có quyền cập nhật
 *       409:
 *         description: Trạng thái đã thay đổi, cần tải lại
 */
router.post('/:id/infrastructure/:type/status', requireChargingStationViewer, chargingStationController.updateInfrastructure);

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
 * /api/admin/charging-stations/{id}/deadline/extend:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Gia hạn hạn 15 ngày của ON trạm (+3 ngày, tối đa 3 lần)
 *     description: Người đề xuất, cấp trên trong nhánh và Admin/Super Admin; bắt buộc lý do. Chỉ áp dụng khi chưa có hạng mục hợp đồng/hạ tầng/tài chính nào hoàn thành và chưa giao trụ. Quá hạn mà chưa hoàn thành thì ON trạm và đề xuất tự động bị hủy.
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
 *             required: [reason]
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200: { description: Đã gia hạn }
 *       400: { description: Hết lượt, quá hạn hoặc không còn đếm hạn }
 *       403: { description: Không thuộc phạm vi đề xuất }
 */
router.post('/:id/deadline/extend', requireChargingStationViewer, chargingStationController.extendDeadline);

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
 * /api/admin/charging-stations/{id}/on-station/mark-active:
 *   post:
 *     tags: [Charging Stations]
 *     summary: SUPER_ADMIN xác nhận ON trạm và chuyển đề xuất sang ACTIVE
 *     description: Hoàn tất hợp đồng/hạ tầng và task giao/lắp/nghiệm thu/ON bằng workflow_override, kể cả dữ liệu trụ cần đối soát. Không thay đổi kho, phiếu giao, tài chính/cọc/hoàn cọc, không tự tạo tài liệu. Giữ cảnh báo đối soát. Không thể kích hoạt lại bản ghi đã hủy.
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
 *             required: [cms_station_code, on_date, reason, expected_token]
 *             properties:
 *               cms_station_code: { type: string }
 *               on_date: { type: string, format: date }
 *               reason: { type: string, minLength: 3, maxLength: 5000 }
 *               expected_token: { type: string }
 *     responses:
 *       200: { description: ON trạm và đề xuất đã chuyển sang Hoạt động }
 *       403: { description: Chỉ SUPER_ADMIN được sử dụng }
 *       409: { description: Bản ghi đã hủy hoặc trạng thái đề xuất không phù hợp }
 */
router.post('/:id/on-station/mark-active', requireSuperAdmin, chargingStationController.markOnStationActive);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/status:
 *   post:
 *     tags: [Charging Stations]
 *     summary: SUPER_ADMIN ghi đè trạng thái quy trình ON trạm, tiến/lùi tùy ý
 *     description: OPERATING dùng chung nghiệp vụ mark-active và yêu cầu mã CMS/ngày ON. CANCELLED dùng nghiệp vụ hủy và lưu trữ đề xuất. Hồ sơ đã hủy phải khôi phục trước. Các trạng thái khác không xóa kết quả đã lưu ở bước sau.
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
 *             required: [to_status, reason, expected_token]
 *             properties:
 *               to_status:
 *                 type: string
 *                 enum: [ONBOARDING, DELIVERING, INSTALLING, ACCEPTANCE, CONFIGURING, OPERATING, CANCELLED]
 *               expected_token: { type: string }
 *               cms_station_code: { type: string }
 *               on_date: { type: string, format: date }
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
router.post('/:id/status', requireSuperAdmin, chargingStationController.changeStatus);

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
