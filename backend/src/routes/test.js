const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /api/test:
 *   get:
 *     tags: [Test]
 *     summary: Health check endpoint
 *     description: Kiểm tra backend API có hoạt động không
 *     responses:
 *       200:
 *         description: API hoạt động bình thường
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Backend API is working!
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 environment:
 *                   type: string
 *                   example: development
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Backend API is working!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

module.exports = router;
