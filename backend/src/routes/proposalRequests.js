const express = require('express');
const router = express.Router();
const { requireAuth, requireProposalManager } = require('../middlewares/auth');
const proposalRequestController = require('../controllers/proposalRequestController');

/**
 * @swagger
 * /api/admin/proposal-requests:
 *   get:
 *     tags: [Proposal Requests]
 *     summary: Danh sách yêu cầu đề xuất (tab "Đề xuất cần thực hiện")
 *     description: ADMIN/SUPER xem tất cả; SALES xem theo nhánh; CTV/NPP chỉ xem đề xuất của mình.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [OPEN, DONE, CANCELLED]
 *           default: OPEN
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [UPDATE_INFO, SUPPLEMENT, RE_GRADE, REVISE_BCDX, TGD_REVIEW, OTHER]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm theo mã đề xuất, tên người đề xuất, mô tả yêu cầu
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền
 */
router.get('/', requireAuth, requireProposalManager, proposalRequestController.list);

/**
 * @swagger
 * /api/admin/proposal-requests/types:
 *   get:
 *     tags: [Proposal Requests]
 *     summary: Danh mục loại yêu cầu đề xuất
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/types', requireAuth, requireProposalManager, proposalRequestController.types);

module.exports = router;
