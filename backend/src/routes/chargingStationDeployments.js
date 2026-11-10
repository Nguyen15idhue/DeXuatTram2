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
 *       Nghiệm thu đạt yêu cầu PDF do người thao tác tải lên.
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
 *               acceptance_file_id: { type: integer, minimum: 1 }
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
router.post('/:id/deployments/:deploymentId/actions', controller.update);

module.exports = router;
