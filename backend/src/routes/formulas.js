const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const formulaService = require('../services/formulaService');

/**
 * @swagger
 * /api/formulas/validate:
 *   post:
 *     tags: [Formulas]
 *     summary: Validate formula expression
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expression]
 *             properties:
 *               expression:
 *                 type: string
 *               fields:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     key:
 *                       type: string
 *                     label:
 *                       type: string
 *     responses:
 *       200:
 *         description: Validation result
 */
router.post('/validate', requireAuth, (req, res) => {
  const { expression, fields = [] } = req.body;
  const result = formulaService.validateFormula(expression, fields);
  res.json({ success: true, data: result });
});

/**
 * @swagger
 * /api/formulas/preview:
 *   post:
 *     tags: [Formulas]
 *     summary: Preview formula evaluation
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expression]
 *             properties:
 *               expression:
 *                 type: string
 *               scope:
 *                 type: object
 *     responses:
 *       200:
 *         description: Preview result
 */
router.post('/preview', requireAuth, async (req, res) => {
  const { expression, scope = {}, metadata } = req.body;
  let result;
  if (metadata) {
    result = await formulaService.evaluatePostFormulaAsync(expression, metadata, scope, { dryRun: true });
  } else {
    result = formulaService.evaluateFormula(expression, scope);
  }
  res.json({ success: true, data: { result } });
});

module.exports = router;
