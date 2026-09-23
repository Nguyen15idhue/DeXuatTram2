const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middlewares/auth');
const helpService = require('../services/helpService');

router.use(requireAuth, requireSuperAdmin);

function handleServiceError(res, error) {
  if (error.statusCode === 400) {
    return res.status(400).json({ success: false, message: error.message });
  }
  console.error('Admin help error:', error);
  return res.status(500).json({ success: false, message: 'Loi server' });
}

/**
 * @swagger
 * /api/admin/help/articles:
 *   get:
 *     tags: [Help Admin]
 *     summary: Danh sach bai viet (SUPER_ADMIN, gom draft/archived)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thanh cong
 */
router.get('/articles', async (req, res) => {
  try {
    const data = await helpService.adminList({
      status: req.query.status,
      category: req.query.category,
      q: req.query.q,
    });
    res.json({ success: true, data });
  } catch (error) {
    handleServiceError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/help/articles/search:
 *   get:
 *     tags: [Help Admin]
 *     summary: Tim kiem bai viet (SUPER_ADMIN)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thanh cong
 */
router.get('/articles/search', async (req, res) => {
  try {
    const data = await helpService.adminList({ q: req.query.q });
    res.json({ success: true, data });
  } catch (error) {
    handleServiceError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/help/categories:
 *   get:
 *     tags: [Help Admin]
 *     summary: Danh sach chuyen muc day du (SUPER_ADMIN)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thanh cong
 */
router.get('/categories', async (req, res) => {
  try {
    const data = await helpService.getCategories('SUPER_ADMIN');
    res.json({ success: true, data });
  } catch (error) {
    handleServiceError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/help/categories:
 *   post:
 *     tags: [Help Admin]
 *     summary: Tao chuyen muc (SUPER_ADMIN)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thanh cong
 *       400:
 *         description: Du lieu khong hop le
 */
router.post('/categories', async (req, res) => {
  try {
    const data = await helpService.createCategory(req.body || {});
    res.json({ success: true, data });
  } catch (error) {
    handleServiceError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/help/import-legacy:
 *   post:
 *     tags: [Help Admin]
 *     summary: Trang thai import guideData cu (seed chay bang script backend/scripts/seed-help.js)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thanh cong
 */
router.post('/import-legacy', async (req, res) => {
  try {
    const data = await helpService.legacyStatus();
    res.json({ success: true, data, message: 'Chay "node backend/scripts/seed-help.js" de import' });
  } catch (error) {
    handleServiceError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/help/articles/{id}:
 *   get:
 *     tags: [Help Admin]
 *     summary: Chi tiet bai viet (SUPER_ADMIN)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thanh cong
 *       404:
 *         description: Khong tim thay
 */
router.get('/articles/:id', async (req, res) => {
  try {
    const data = await helpService.adminGet(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Khong tim thay bai viet' });
    res.json({ success: true, data });
  } catch (error) {
    handleServiceError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/help/articles:
 *   post:
 *     tags: [Help Admin]
 *     summary: Tao bai viet (SUPER_ADMIN)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thanh cong
 *       400:
 *         description: Du lieu khong hop le
 */
router.post('/articles', async (req, res) => {
  try {
    const data = await helpService.createArticle(req.body || {}, req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    handleServiceError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/help/articles/{id}:
 *   put:
 *     tags: [Help Admin]
 *     summary: Sua bai viet (SUPER_ADMIN)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thanh cong
 *       400:
 *         description: Du lieu khong hop le
 *       404:
 *         description: Khong tim thay
 */
router.put('/articles/:id', async (req, res) => {
  try {
    const data = await helpService.updateArticle(req.params.id, req.body || {}, req.user.id);
    if (!data) return res.status(404).json({ success: false, message: 'Khong tim thay bai viet' });
    res.json({ success: true, data });
  } catch (error) {
    handleServiceError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/help/articles/{id}:
 *   delete:
 *     tags: [Help Admin]
 *     summary: Xoa bai viet (SUPER_ADMIN)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thanh cong
 *       404:
 *         description: Khong tim thay
 */
router.delete('/articles/:id', async (req, res) => {
  try {
    const ok = await helpService.deleteArticle(req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: 'Khong tim thay bai viet' });
    res.json({ success: true, message: 'Da xoa' });
  } catch (error) {
    handleServiceError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/help/articles/{id}/publish:
 *   post:
 *     tags: [Help Admin]
 *     summary: Xuat ban bai viet (SUPER_ADMIN)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thanh cong
 *       404:
 *         description: Khong tim thay
 */
router.post('/articles/:id/publish', async (req, res) => {
  try {
    const data = await helpService.setArticleStatus(req.params.id, 'published', req.user.id);
    if (!data) return res.status(404).json({ success: false, message: 'Khong tim thay bai viet' });
    res.json({ success: true, data });
  } catch (error) {
    handleServiceError(res, error);
  }
});

/**
 * @swagger
 * /api/admin/help/articles/{id}/archive:
 *   post:
 *     tags: [Help Admin]
 *     summary: Luu tru bai viet (SUPER_ADMIN)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thanh cong
 *       404:
 *         description: Khong tim thay
 */
router.post('/articles/:id/archive', async (req, res) => {
  try {
    const data = await helpService.setArticleStatus(req.params.id, 'archived', req.user.id);
    if (!data) return res.status(404).json({ success: false, message: 'Khong tim thay bai viet' });
    res.json({ success: true, data });
  } catch (error) {
    handleServiceError(res, error);
  }
});

module.exports = router;
