const express = require('express');
const router = express.Router();
const { crmWebhookAuth } = require('../middlewares/crmWebhookAuth');
const crmPartnerController = require('../controllers/crmPartnerController');

/**
 * @swagger
 * /api/v1/partner/leads:
 *   post:
 *     tags: [CRM Partner]
 *     summary: Nhận khách từ TMT CRM (webhook)
 *     security: []
 *     responses:
 *       200:
 *         description: Đã nhận
 *       401:
 *         description: Sai chữ ký
 *       429:
 *         description: Rate limit
 */
router.post('/leads', crmWebhookAuth, crmPartnerController.receiveLeads);

module.exports = router;
