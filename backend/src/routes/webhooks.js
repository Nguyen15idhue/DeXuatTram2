const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
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
                 *                 enum: [APPROVED, ARCHIVED, CONTRACT_SIGNED, CONTRACT_FAILED, CANCELLED]
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

module.exports = router;
