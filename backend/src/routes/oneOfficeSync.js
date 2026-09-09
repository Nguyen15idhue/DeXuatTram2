const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const syncService = require('../services/syncService');

/**
 * @swagger
 * /api/admin/1office/push:
 *   post:
 *     tags: [1Office Sync]
 *     summary: Push proposals sang 1Office
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
    const result = await syncService.pushTo1Office(proposalIds, apiConfigId, req.user.id);
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
router.post('/link', requireAuth, async (req, res) => {
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
router.post('/unlink', requireAuth, async (req, res) => {
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

module.exports = router;
