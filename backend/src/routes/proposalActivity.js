const express = require('express');
const router = express.Router();
const { requireAuth, requireUserManager } = require('../middlewares/auth');
const proposalActivityController = require('../controllers/proposalActivityController');

/**
 * @swagger
 * /api/admin/proposal-logs:
 *   get:
 *     tags: [Proposal Activity]
 *     summary: Log hoạt động đề xuất (tab mới trong Audit Log)
 *     description: Phân quyền y hệt lịch sử đồng bộ 1Office (ADMIN/SUPER tất cả, SALES theo nhánh).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: integer
 *         description: Tìm theo ID dòng log
 *       - in: query
 *         name: proposal_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         description: Tìm theo mã đề xuất (ma_de_xuat/tracking_code)
 *       - in: query
 *         name: actor
 *         schema:
 *           type: string
 *         description: Tìm theo tên người thực hiện
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [created, updated, status_change, status_change_denied, station_created, auto_failed]
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *           enum: [user, webhook, script, system_auto, admin_override]
 *       - in: query
 *         name: date_from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền
 */
router.get('/', requireAuth, requireUserManager, proposalActivityController.getAll);

/**
 * @swagger
 * /api/admin/proposal-logs/{proposalId}/timeline:
 *   get:
 *     tags: [Proposal Activity]
 *     summary: Timeline hoạt động của 1 đề xuất (popup Xem log)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: proposalId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thành công
 *       403:
 *         description: Ngoài nhánh (SALES)
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.get('/:proposalId/timeline', requireAuth, requireUserManager, proposalActivityController.timeline);

module.exports = router;
