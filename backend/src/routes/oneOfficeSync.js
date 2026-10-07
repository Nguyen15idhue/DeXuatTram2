const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin, requireUserManager } = require('../middlewares/auth');
const syncService = require('../services/syncService');
const templateService = require('../services/templateService');
const apiConfigService = require('../services/apiConfigService');
const pool = require('../utils/db');

/**
 * @swagger
 * /api/admin/1office/push:
 *   post:
 *     tags: [1Office Sync]
 *     summary: Push proposals sang 1Office (đẩy tay — mọi trạng thái đều được)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [apiConfigId, proposalIds]
 *             properties:
 *               apiConfigId:
 *                 type: integer
 *               proposalIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Queue jobs created
 */
router.post('/push', requireAuth, async (req, res) => {
  try {
    const { apiConfigId, proposalIds } = req.body;
    if (!apiConfigId || !proposalIds || !Array.isArray(proposalIds) || proposalIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Thiếu apiConfigId hoặc proposalIds' });
    }
    const result = await syncService.pushTo1Office(proposalIds, apiConfigId, req.user.id, { allowAllStatuses: true });
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(e.statusCode || 500).json({ success: false, message: e.message });
  }
});

/**
 * @swagger
 * /api/admin/1office/pull:
 *   post:
 *     tags: [1Office Sync]
 *     summary: Pull contacts từ 1Office
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [apiConfigId]
 *             properties:
 *               apiConfigId:
 *                 type: integer
 *               filter:
 *                 type: object
 *     responses:
 *       200:
 *         description: Queue job created
 */
router.post('/pull', requireAuth, async (req, res) => {
  try {
    const { apiConfigId, filter } = req.body;
    if (!apiConfigId) {
      return res.status(400).json({ success: false, message: 'Thiếu apiConfigId' });
    }
    const result = await syncService.pullFrom1Office(apiConfigId, filter, req.user.id);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(e.statusCode || 500).json({ success: false, message: e.message });
  }
});

/**
 * @swagger
 * /api/admin/1office/link:
 *   post:
 *     tags: [1Office Sync]
 *     summary: Link proposal với contact 1Office
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [proposalId, contactCode]
 *             properties:
 *               proposalId:
 *                 type: integer
 *               contactCode:
 *                 type: string
 *               apiConfigId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Linked
 */
router.post('/link', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { proposalId, contactCode, apiConfigId } = req.body;
    if (!proposalId || !contactCode) {
      return res.status(400).json({ success: false, message: 'Thiếu proposalId hoặc contactCode' });
    }
    const result = await syncService.linkProposal(proposalId, contactCode, apiConfigId);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(e.statusCode || 500).json({ success: false, message: e.message });
  }
});

/**
 * @swagger
 * /api/admin/1office/unlink:
 *   post:
 *     tags: [1Office Sync]
 *     summary: Hủy link proposal
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [proposalId]
 *             properties:
 *               proposalId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Unlinked
 */
router.post('/unlink', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { proposalId } = req.body;
    if (!proposalId) {
      return res.status(400).json({ success: false, message: 'Thiếu proposalId' });
    }
    const result = await syncService.unlinkProposal(proposalId);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(e.statusCode || 500).json({ success: false, message: e.message });
  }
});

/**
 * @swagger
 * /api/admin/1office/contacts/search:
 *   get:
 *     tags: [1Office Sync]
 *     summary: Tìm contacts trên 1Office
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: configId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/contacts/search', requireAuth, async (req, res) => {
  try {
    const { configId, q } = req.query;
    if (!configId) {
      return res.status(400).json({ success: false, message: 'Thiếu configId' });
    }
    const result = await syncService.searchContacts(parseInt(configId), q || '');
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(e.statusCode || 500).json({ success: false, message: e.message });
  }
});

/**
 * @swagger
 * /api/admin/1office/preview:
 *   post:
 *     tags: [1Office Sync]
 *     summary: Preview HTML desc từ template
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [apiConfigId, proposalId]
 *             properties:
 *               apiConfigId:
 *                 type: integer
 *               proposalId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: HTML preview
 */
router.post('/preview', requireAuth, async (req, res) => {
  try {
    const { apiConfigId, proposalId } = req.body;
    if (!apiConfigId || !proposalId) {
      return res.status(400).json({ success: false, message: 'Thiếu apiConfigId hoặc proposalId' });
    }
    const [proposals] = await pool.query('SELECT * FROM station_proposals WHERE id = ?', [proposalId]);
    if (proposals.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy proposal' });
    }
    const proposal = proposals[0];
    const html = await templateService.render(proposal, apiConfigId);
    const template = await apiConfigService.getDescTemplate(apiConfigId);
    const validation = templateService.validateTemplate(template);
    res.json({
      success: true,
      data: {
        html,
        proposalId,
        apiConfigId,
        templateValid: validation.valid,
        templateErrors: validation.errors
      }
    });
  } catch (e) {
    res.status(e.statusCode || 500).json({ success: false, message: e.message });
  }
});

/**
 * @swagger
 * /api/admin/1office/template:
 *   get:
 *     tags: [1Office Sync]
 *     summary: Lấy desc template config
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: configId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Template config
 */
router.get('/template', requireAuth, async (req, res) => {
  try {
    const { configId } = req.query;
    if (!configId) {
      return res.status(400).json({ success: false, message: 'Thiếu configId' });
    }
    const template = await apiConfigService.getDescTemplate(parseInt(configId));
    res.json({ success: true, data: template });
  } catch (e) {
    res.status(e.statusCode || 500).json({ success: false, message: e.message });
  }
});

/**
 * @swagger
 * /api/admin/1office/template:
 *   put:
 *     tags: [1Office Sync]
 *     summary: Cập nhật desc template config
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [configId, template]
 *             properties:
 *               configId:
 *                 type: integer
 *               template:
 *                 type: object
 *     responses:
 *       200:
 *         description: Updated
 */
router.put('/template', requireAuth, async (req, res) => {
  try {
    const { configId, template } = req.body;
    if (!configId || !template) {
      return res.status(400).json({ success: false, message: 'Thiếu configId hoặc template' });
    }
    const validation = templateService.validateTemplate(template);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: 'Template không hợp lệ', errors: validation.errors });
    }
    await apiConfigService.updateDescTemplate(parseInt(configId), template);
    res.json({ success: true, message: 'Cập nhật template thành công' });
  } catch (e) {
    res.status(e.statusCode || 500).json({ success: false, message: e.message });
  }
});

/**
 * @swagger
 * /api/admin/1office/restore/preview:
 *   post:
 *     tags: [1Office Sync]
 *     summary: Xem trước khôi phục đề xuất đã xóa từ contact 1Office (theo mã)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *                 description: Mã đề xuất (mã contact bên 1Office)
 *               apiConfigId:
 *                 type: integer
 *                 default: 3
 *     responses:
 *       200:
 *         description: Dữ liệu dựng lại + danh sách trường còn thiếu
 *       404:
 *         description: Mã không còn trên 1Office
 *       409:
 *         description: Mã đã tồn tại bên web
 */
router.post('/restore/preview', requireAuth, requireUserManager, async (req, res) => {
  try {
    const { code, apiConfigId } = req.body;
    const result = await syncService.previewRestoreFrom1Office(code, apiConfigId || 3);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(e.statusCode || 500).json({ success: false, message: e.message });
  }
});

/**
 * @swagger
 * /api/admin/1office/restore/confirm:
 *   post:
 *     tags: [1Office Sync]
 *     summary: Xác nhận khôi phục đề xuất từ 1Office (tạo mới PENDING + giữ mã + auto-link)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *               apiConfigId:
 *                 type: integer
 *                 default: 3
 *               overrides:
 *                 type: object
 *                 description: Bổ sung trường bắt buộc còn thiếu (latitude, longitude, owner_name, province...)
 *               fileAssignments:
 *                 type: object
 *                 description: "Gán tay file chưa xác định được ô {ten_file: ma_o_file}"
 *     responses:
 *       200:
 *         description: Đã khôi phục (trả proposalId)
 */
router.post('/restore/confirm', requireAuth, requireUserManager, async (req, res) => {
  try {
    const { code, apiConfigId, overrides, fileAssignments } = req.body;
    const result = await syncService.confirmRestoreFrom1Office(code, apiConfigId || 3, req.user.id, overrides || {}, req.ip, fileAssignments || {});
    res.json({ success: true, data: result, message: `Đã khôi phục đề xuất ${result.maDeXuat}` });
  } catch (e) {
    res.status(e.statusCode || 500).json({ success: false, message: e.message });
  }
});

module.exports = router;
