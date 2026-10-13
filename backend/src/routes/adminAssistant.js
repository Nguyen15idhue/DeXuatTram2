const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middlewares/auth');
const { assistantLimiter } = require('../middlewares/rateLimits');
const assistantConfigService = require('../services/assistantConfigService');
const assistantService = require('../services/assistantService');

router.use(requireAuth, requireSuperAdmin);

/**
 * @swagger
 * /api/admin/assistant/config:
 *   get:
 *     tags: [Admin - Assistant]
 *     summary: Cấu hình provider/model/fallback của chatbot (SUPER_ADMIN)
 *     description: Trả về enabled, models, visionModels, priority theo từng provider + trạng thái key (không lộ key). Models rỗng = dùng env.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền SUPER_ADMIN
 */
router.get('/config', async (req, res) => {
  try {
    const data = await assistantConfigService.getConfig();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Get assistant config error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

/**
 * @swagger
 * /api/admin/assistant/config:
 *   put:
 *     tags: [Admin - Assistant]
 *     summary: Lưu cấu hình provider/model/fallback (SUPER_ADMIN)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [providers]
 *             properties:
 *               providers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [provider, enabled, priority]
 *                   properties:
 *                     provider:
 *                       type: string
 *                       enum: [gemini, openrouter]
 *                     enabled:
 *                       type: boolean
 *                     models:
 *                       type: array
 *                       items:
 *                         type: string
 *                     visionModels:
 *                       type: array
 *                       items:
 *                         type: string
 *                     priority:
 *                       type: integer
 *                       minimum: 1
 *                       maximum: 99
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền SUPER_ADMIN
 */
router.put('/config', async (req, res) => {
  try {
    const data = await assistantConfigService.saveConfig(req.body);
    res.json({ success: true, data, message: 'Đã lưu cấu hình trợ lý' });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('Save assistant config error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

/**
 * @swagger
 * /api/admin/assistant/models:
 *   get:
 *     tags: [Admin - Assistant]
 *     summary: Danh sách model thực tế của provider (SUPER_ADMIN)
 *     description: Gemini đọc từ ListModels API (cần key), OpenRouter đọc từ /models public. Cache 24h trong DB; refresh=1 để tải lại. Lỗi mạng/key trả 502/503, FE giữ nhập tay.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *           enum: [gemini, openrouter]
 *       - in: query
 *         name: refresh
 *         schema:
 *           type: string
 *           enum: ['0', '1']
 *     responses:
 *       200:
 *         description: Thành công (models/cached/fetchedAt)
 *       400:
 *         description: Provider không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền SUPER_ADMIN
 *       502:
 *         description: Không tải được danh sách
 *       503:
 *         description: Chưa cấu hình key
 */
router.get('/models', async (req, res) => {
  try {
    const data = await assistantConfigService.listModels(
      req.query.provider,
      String(req.query.refresh) === '1'
    );
    res.json({ success: true, data });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.statusCode === 503) {
      return res.status(503).json({ success: false, message: error.message });
    }
    console.error('List assistant models error:', error.message);
    res.status(502).json({ success: false, message: 'Không tải được danh sách model lúc này' });
  }
});

/**
 * @swagger
 * /api/admin/assistant/test:
 *   post:
 *     tags: [Admin - Assistant]
 *     summary: Hỏi thử chatbot với cấu hình hiện tại (SUPER_ADMIN, không ghi log)
 *     description: Chạy đúng pipeline ask (guard + retrieval + provider theo fallback). provider = auto|gemini|openrouter để ép provider khi test. Rate limit 30/giờ.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [question]
 *             properties:
 *               question:
 *                 type: string
 *               provider:
 *                 type: string
 *                 enum: [auto, gemini, openrouter]
 *     responses:
 *       200:
 *         description: Thành công (answer/sources/provider/model/latencyMs)
 *       400:
 *         description: Câu hỏi quá ngắn hoặc provider không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền SUPER_ADMIN
 *       503:
 *         description: Provider chưa sẵn sàng
 */
router.post('/test', assistantLimiter, async (req, res) => {
  try {
    const question = req.body && req.body.question;
    if (!question || String(question).trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Câu hỏi quá ngắn' });
    }
    const provider = req.body && req.body.provider ? String(req.body.provider) : 'auto';
    if (!['auto', 'gemini', 'openrouter'].includes(provider)) {
      return res.status(400).json({ success: false, message: 'provider phai la auto|gemini|openrouter' });
    }
    const data = await assistantService.ask(
      question,
      req.user || null,
      [],
      { onlyProviders: provider === 'auto' ? null : [provider], testMode: true }
    );
    res.json({ success: true, data });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.statusCode === 503) {
      return res.status(503).json({ success: false, message: error.message || 'Provider chưa sẵn sàng' });
    }
    console.error('Assistant test error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
