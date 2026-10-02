const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const workProcessWebhookController = require('../controllers/workProcessWebhookController');
const { webhookLimiter } = require('../middlewares/rateLimits');

/**
 * @swagger
 * /api/webhooks/oneoffice/proposal-status:
 *   post:
 *     tags: [Webhooks - 1Office]
 *     summary: 1Office đẩy sự kiện trạng thái đề xuất (BPA HTTP node gọi sang)
 *     description: Xác thực bằng header `x-webhook-secret` (ONEOFFICE_WEBHOOK_SECRET). Cập nhật status theo ma trận rồi trả kết quả đồng bộ để BPA đi tiếp theo Success path `$.success = true`.
 *     parameters:
 *       - in: header
 *         name: x-webhook-secret
 *         schema:
 *           type: string
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [event_id, event]
 *             properties:
 *               event_id:
 *                 type: string
 *                 description: Idempotency key (BPA retry cùng id không đẻ log kép)
 *               event:
 *                 type: string
                 *                 enum: [PRINCIPLE_APPROVED, APPROVED, ARCHIVED, CONTRACT_SIGNED, CONTRACT_FAILED, CANCELLED]
 *               proposal_code:
 *                 type: string
 *                 description: tracking_code | ma_de_xuat_gen | custom_data.ma_de_xuat
 *               contact_code:
 *                 type: string
 *                 description: contact_1office_code (dùng khi không có proposal_code)
 *               note:
 *                 type: string
 *               event_time:
 *                 type: string
 *               actor:
 *                 type: string
 *     responses:
 *       200:
 *         description: Thành công (kể cả event trùng — trả kết quả cũ kèm duplicate=true)
 *       401:
 *         description: Webhook secret không hợp lệ
 *       404:
 *         description: Không tìm thấy đề xuất theo mã
 */
router.post('/oneoffice/proposal-status', webhookLimiter, webhookController.proposalStatus);

/**
 * @swagger
 * /api/webhooks/oneoffice/work-process/move-to-project:
 *   post:
 *     tags: [Webhooks - 1Office]
 *     summary: Nhận ID/project_id/access_token từ 1Office, cập nhật quy trình vào dự án rồi forward nguyên response 1Office
 *     description: Xác thực bằng header `X-1Office-Signature` (ONEOFFICE_WORK_SIGNATURE, fallback secret webhook cũ). Token ưu tiên từ body/query, fallback api_configs. Forward nguyên status + JSON `{error, preventDefault, mode, postId, data}` để BPA đi nhánh như gọi trực tiếp.
 *     parameters:
 *       - in: header
 *         name: X-1Office-Signature
 *         schema:
 *           type: string
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ID, project_id]
 *             properties:
 *               ID:
 *                 type: string
 *                 description: ID quy trình 1Office (postId)
 *               project_id:
 *                 type: string
 *                 description: ID dự án đích (lưu ý: dự án "mã 2" có ID=3)
 *               access_token:
 *                 type: string
 *                 description: Token 1Office gửi kèm; thiếu thì dùng token lưu sẵn
 *               base_url:
 *                 type: string
 *                 description: Mặc định https://egr.1office.vn, chỉ cho host *.1office.vn
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required: [ID, project_id]
 *             properties:
 *               ID:
 *                 type: string
 *               project_id:
 *                 type: string
 *               access_token:
 *                 type: string
 *               base_url:
 *                 type: string
 *     responses:
 *       200:
 *         description: Forward nguyên JSON 1Office {error:false, preventDefault, mode, postId, data}
 *       400:
 *         description: Thiếu ID/project_id/access_token hoặc base_url ngoài whitelist {error:true}
 *       401:
 *         description: Chữ ký webhook không hợp lệ {error:true}
 */
router.post('/oneoffice/work-process/move-to-project', webhookLimiter, workProcessWebhookController.moveToProject);

module.exports = router;
