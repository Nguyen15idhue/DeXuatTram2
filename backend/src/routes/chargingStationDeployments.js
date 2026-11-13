const router = require('express').Router();
const { requireAuth } = require('../middlewares/auth');
const controller = require('../controllers/chargingStationDeploymentController');

router.use(requireAuth);

/**
 * @swagger
 * /api/admin/charging-stations/{id}/deployments:
 *   get:
 *     tags: [Charging Stations]
 *     summary: Các phần trụ đã nhận và tiến độ lắp đặt độc lập
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Danh sách phần trụ, số lượng, bước, biên bản PDF và ngày ON
 *       401: { description: Chưa đăng nhập }
 *       403: { description: Ngoài phạm vi xem }
 *       404: { description: Không tìm thấy ON trạm }
 * /api/admin/charging-stations/{id}/deployments/{deploymentId}/actions:
 *   post:
 *     tags: [Charging Stations]
 *     summary: Tiến hành lắp đặt, nghiệm thu hoặc ON một phần trụ đã nhận
 *     description: >
 *       Chỉ SUPER_ADMIN và Setup/Vận hành; ADMIN chỉ đọc.
 *       request_id duy nhất theo trạm bảo đảm không lặp ghi log/thông báo.
 *       Lắp xong mở hai công việc nghiệm thu và ON song song.
 *       Nghiệm thu đạt yêu cầu equipment và infrastructure, mỗi bộ có file PDF/Word và ít nhất 2 ảnh.
 *       expected_version là workflow_version của phần trụ; đã hoàn tất chỉ SUPER_ADMIN sửa qua Thông tin chung.
 *       ON yêu cầu mã CMS chung và ngày hợp lệ. Nếu thiếu hợp đồng, một trong hai
 *       hạ tầng hoặc tài chính, bắt buộc accept_missing=true và reason.
 *       Phần trụ ON đầu tiên kích hoạt đề xuất; phần sau không thay mã/ngày ON trạm.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: path
 *         name: deploymentId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action, request_id]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [start-installation, complete-installation, acceptance-failed, acceptance-passed, complete-configuration]
 *               request_id: { type: string, maxLength: 100 }
 *               reason: { type: string, maxLength: 5000 }
 *               expected_version: { type: integer, minimum: 0 }
 *               equipment:
 *                 type: object
 *                 required: [file_id, image_ids]
 *                 properties:
 *                   file_id: { type: integer }
 *                   image_ids: { type: array, minItems: 2, maxItems: 100, uniqueItems: true, items: { type: integer } }
 *                   note: { type: string, nullable: true, maxLength: 5000 }
 *               infrastructure:
 *                 type: object
 *                 required: [file_id, image_ids]
 *                 properties:
 *                   file_id: { type: integer }
 *                   image_ids: { type: array, minItems: 2, maxItems: 100, uniqueItems: true, items: { type: integer } }
 *                   note: { type: string, nullable: true, maxLength: 5000 }
 *               cms_station_code: { type: string, maxLength: 100 }
 *               on_date: { type: string, format: date }
 *               accept_missing: { type: boolean }
 *     responses:
 *       200: { description: Phần trụ và ON trạm đã cập nhật hoặc kết quả lần gọi trước }
 *       400: { description: Thiếu thông tin hoặc điều kiện chưa được xác nhận }
 *       401: { description: Chưa đăng nhập }
 *       403: { description: Không có quyền thao tác hoặc không sở hữu PDF }
 *       404: { description: Không tìm thấy ON trạm hoặc phần trụ }
 *       409: { description: Sai bước hoặc xung đột request_id hoặc mã CMS }
 */
router.get('/:id/deployments', controller.list);
/**
 * @swagger
 * /api/admin/charging-stations/{id}/installation:
 *   put:
 *     tags: [Charging Stations]
 *     summary: Lưu đồng thời trạng thái và ghi chú các phần trụ đã nhận
 *     description: Setup chỉ tiến từng bước NOT/DOING/DONE; SUPER_ADMIN được lùi nhưng giữ kết quả nghiệm thu/cấu hình/ON. Mỗi dòng cần id, status, note, expected_version. request_id bảo đảm idempotency.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items, request_id]
 *             properties:
 *               request_id: { type: string }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [id, status, expected_version]
 *                   properties:
 *                     id: { type: integer }
 *                     status: { type: string, enum: [NOT, DOING, DONE] }
 *                     note: { type: string }
 *                     expected_version: { type: integer }
 *     responses:
 *       200: { description: Đã lưu toàn bộ }
 *       403: { description: Không có quyền }
 *       409: { description: Dữ liệu đã thay đổi }
 */
router.put('/:id/installation', controller.installation);
/**
 * @swagger
 * /api/admin/charging-stations/{id}/on-station:
 *   put:
 *     tags: [Charging Stations]
 *     summary: Xác nhận ON một hoặc nhiều phần trụ đã lắp xong, không cần chờ nghiệm thu
 *     description: >
 *       Chỉ Setup/Vận hành và SUPER_ADMIN. Lưu nguyên tử, chống lặp bằng request_id.
 *       Không đóng công việc nghiệm thu. Ngày ON chung giữ theo lần xác nhận đầu tiên;
 *       khi chọn nhiều phần trong lần đầu, lấy ngày của phần có ID nhỏ nhất.
 *       Thiếu hợp đồng/hạ tầng/tài chính cần accept_missing=true và reason.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [request_id, cms_station_code, items]
 *             properties:
 *               request_id: { type: string, maxLength: 100 }
 *               cms_station_code: { type: string, maxLength: 100 }
 *               reason: { type: string, maxLength: 5000 }
 *               accept_missing: { type: boolean }
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 1000
 *                 items:
 *                   type: object
 *                   required: [id, expected_version, on_date]
 *                   properties:
 *                     id: { type: integer }
 *                     expected_version: { type: integer, minimum: 0 }
 *                     on_date: { type: string, format: date }
 *                     note: { type: string, nullable: true, maxLength: 5000 }
 *     responses:
 *       200: { description: Các phần trụ đã ON; nghiệm thu giữ nguyên }
 *       400: { description: Thiếu thông tin hoặc chưa xác nhận rủi ro }
 *       403: { description: Không có quyền }
 *       409: { description: Phần trụ chưa lắp xong, đã ON hoặc dữ liệu đã thay đổi }
 */
router.put('/:id/on-station', controller.onStation);
router.post('/:id/deployments/:deploymentId/actions', controller.update);

module.exports = router;
