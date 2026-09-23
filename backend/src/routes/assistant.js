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
 * /api/assistant/ask-stream:
 *   post:
 *     tags: [Assistant]
 *     summary: Hỏi chatbot dạng streaming (SSE)
 *     description: Trả lời dạng Server-Sent Events. Sự kiện `delta` (text từng phần), `done` (nguồn/provider), `error`.
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
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: SSE stream (text/event-stream)
 *       400:
 *         description: Câu hỏi quá ngắn
 *       503:
 *         description: Chưa cấu hình provider AI
 */
router.post('/ask-stream', assistantLimiter, optionalAuth, async (req, res) => {
  const question = req.body && req.body.question;
  const history = req.body && req.body.history;
  if (!question || String(question).trim().length < 2) {
    return res.status(400).json({ success: false, message: 'Câu hỏi quá ngắn' });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  let closed = false;
  req.on('close', () => { closed = true; });
  const send = (event, data) => {
    if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await assistantService.askStream(
      question,
      req.user || null,
      history,
      (text) => send('delta', { text }),
      (statusData) => send('status', statusData)
    );
    send('done', {
      sources: result.sources || [],
      provider: result.provider || null,
      model: result.model || null,
      cached: !!result.cached,
      fallbackReason: result.fallbackReason || null,
    });
  } catch (error) {
    if (error.statusCode === 503) {
      send('error', { message: 'Chatbot chưa được cấu hình' });
    } else {
      send('error', { message: 'Lỗi server' });
      console.error('Assistant ask-stream error:', error);
    }
  } finally {
    if (!closed) res.end();
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
