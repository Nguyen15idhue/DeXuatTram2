const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middlewares/auth');
const { publicDataLimiter } = require('../middlewares/rateLimits');
const helpService = require('../services/helpService');

/**
 * @swagger
 * /api/help/categories:
 *   get:
 *     tags: [Help]
 *     summary: Danh sach chuyen muc huong dan (loc theo vai tro)
 *     responses:
 *       200:
 *         description: Thanh cong
 */
router.get('/categories', publicDataLimiter, optionalAuth, async (req, res) => {
  try {
    const role = req.user ? req.user.role : null;
    const data = await helpService.getCategories(role);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Get help categories error:', error);
    res.status(500).json({ success: false, message: 'Loi server' });
  }
});

/**
 * @swagger
 * /api/help/articles:
 *   get:
 *     tags: [Help]
 *     summary: Danh sach bai huong dan published (loc category/tu khoa/vai tro)
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Slug chuyen muc
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Tu khoa (FULLTEXT khi >= 3 ky tu)
 *     responses:
 *       200:
 *         description: Thanh cong
 */
router.get('/articles', publicDataLimiter, optionalAuth, async (req, res) => {
  try {
    const role = req.user ? req.user.role : null;
    const data = await helpService.listArticles(
      { category: req.query.category, q: req.query.q },
      role
    );
    res.json({ success: true, data });
  } catch (error) {
    console.error('List help articles error:', error);
    res.status(500).json({ success: false, message: 'Loi server' });
  }
});

/**
 * @swagger
 * /api/help/articles/{slug}:
 *   get:
 *     tags: [Help]
 *     summary: Chi tiet bai huong dan (nhan slug hoac legacy_id nhu G39)
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thanh cong
 *       404:
 *         description: Khong tim thay
 */
router.get('/articles/:slug', publicDataLimiter, optionalAuth, async (req, res) => {
  try {
    const role = req.user ? req.user.role : null;
    const data = await helpService.getBySlug(req.params.slug, role);
    if (!data) return res.status(404).json({ success: false, message: 'Khong tim thay bai huong dan' });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Get help article error:', error);
    res.status(500).json({ success: false, message: 'Loi server' });
  }
});

/**
 * @swagger
 * /api/help/track-view:
 *   post:
 *     tags: [Help]
 *     summary: Tang luot xem bai viet
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Thanh cong
 */
router.post('/track-view', publicDataLimiter, async (req, res) => {
  try {
    if (!req.body || !req.body.id) {
      return res.status(400).json({ success: false, message: 'Thieu id' });
    }
    await helpService.trackView(req.body.id);
    res.json({ success: true, message: 'OK' });
  } catch (error) {
    console.error('Track help view error:', error);
    res.status(500).json({ success: false, message: 'Loi server' });
  }
});

module.exports = router;
