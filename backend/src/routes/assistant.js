const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middlewares/auth');
const { assistantLimiter } = require('../middlewares/rateLimits');
const assistantService = require('../services/assistantService');

/**
 * @swagger
 * /api/assistant/ask:
 *   post:
 *     tags: [Assistant]
 *     summary: Hỏi chatbot hướng dẫn (Gemini chính, OpenRouter dự phòng)
 *     description: Truy hồi top bài hướng dẫn đã xuất bản theo trọng số, viết lại câu hỏi nối tiếp theo ngữ cảnh hội thoại, trả lời kèm nguồn #slug. Chỉ đọc bài published + lọc theo vai trò; ẩn PII. Rate limit 30/giờ.
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
 *               history:
 *                 type: array
 *                 description: Lịch sử hội thoại gần nhất (tối đa 10 lượt) để hiểu ngữ cảnh
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *     responses:
 *       200:
 *         description: Thành công (kèm sources/provider)
 *       400:
 *         description: Câu hỏi quá ngắn
 *       429:
 *         description: Quá nhiều yêu cầu
 *       503:
 *         description: Chưa cấu hình provider AI
 */
router.post('/ask', assistantLimiter, optionalAuth, async (req, res) => {
  try {
    const question = req.body && req.body.question;
    const history = req.body && req.body.history;
    if (!question || String(question).trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Câu hỏi quá ngắn' });
    }
    const data = await assistantService.ask(question, req.user || null, history);
    res.json({ success: true, data });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.statusCode === 503) {
      return res.status(503).json({ success: false, message: 'Chatbot chưa được cấu hình' });
    }
    console.error('Assistant ask error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

/**
 * @swagger
 * /api/assistant/status:
 *   get:
 *     tags: [Assistant]
 *     summary: Trạng thái chatbot (đã cấu hình provider chưa)
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/status', optionalAuth, async (req, res) => {
  try {
    res.json({ success: true, data: { enabled: assistantService.isEnabled() } });
  } catch (error) {
    console.error('Assistant status error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
