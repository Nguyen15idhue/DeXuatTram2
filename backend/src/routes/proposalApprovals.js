const express = require('express');
const router = express.Router();
const { requireAuth, requireUserManager } = require('../middlewares/auth');
const proposalApprovalController = require('../controllers/proposalApprovalController');

/**
 * @swagger
 * /api/admin/proposal-approvals:
 *   get:
 *     tags: [Proposal Approvals]
 *     summary: Danh sách đề xuất cho trang Duyệt BCĐX (Back Office)
 *     description: >
 *       tab=all: PROPOSAL_REPORT_REVIEWING, PROPOSAL_REPORT_UPDATING, SIGNATURE_PENDING, COMPLETED;
 *       tab=pending: PROPOSAL_REPORT_REVIEWING; tab=updating: PROPOSAL_REPORT_UPDATING;
 *       tab=completed: SIGNATURE_PENDING, COMPLETED.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tab
 *         schema:
 *           type: string
 *           enum: [all, pending, updating, completed]
 *           default: all
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
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
router.get('/', requireAuth, requireUserManager, proposalApprovalController.list);

/**
 * @swagger
 * /api/admin/proposal-approvals/{id}/request-update:
 *   put:
 *     tags: [Proposal Approvals]
 *     summary: Back Office yêu cầu cập nhật lại file BCĐX / thông tin đề xuất
 *     description: >
 *       Áp dụng cho đề xuất PROPOSAL_REPORT_REVIEWING. Bắt buộc mô tả; đề xuất chuyển sang
 *       PROPOSAL_REPORT_UPDATING, tạo Yêu cầu đề xuất loại UPDATE_INFO và thông báo
 *       người đề xuất + GĐTTKD đúng khu vực.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [description]
 *             properties:
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Sai trạng thái hoặc thiếu mô tả
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.put('/:id/request-update', requireAuth, requireUserManager, proposalApprovalController.requestUpdate);

/**
 * @swagger
 * /api/admin/proposal-approvals/{id}/signature-config:
 *   get:
 *     tags: [Proposal Approvals]
 *     summary: Cấu hình ký hiện tại của đề xuất
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
 *         description: Thành công
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.get('/:id/signature-config', requireAuth, requireUserManager, proposalApprovalController.getSignatureConfig);

/**
 * @swagger
 * /api/admin/proposal-approvals/{id}/signer-candidates:
 *   get:
 *     tags: [Proposal Approvals]
 *     summary: Danh sách người có thể ký (người đề xuất, GĐTTKD, Tổng giám đốc)
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
 *         description: Thành công
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.get('/:id/signer-candidates', requireAuth, requireUserManager, proposalApprovalController.getSignerCandidates);

/**
 * @swagger
 * /api/admin/proposal-approvals/{id}/signature-config:
 *   put:
 *     tags: [Proposal Approvals]
 *     summary: Cấu hình vị trí ký và trình ký BCĐX
 *     description: >
 *       Áp dụng cho đề xuất PROPOSAL_REPORT_REVIEWING. Gửi danh sách người ký kèm vị trí ô ký
 *       (page/pos_x/pos_y/box_width/box_height chuẩn hóa 0..1). Xác nhận xong đề xuất chuyển
 *       sang SIGNATURE_PENDING và thông báo tới những người được cấu hình.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               file_id:
 *                 type: integer
 *               signers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: integer
 *                     signer_title:
 *                       type: string
 *                     page:
 *                       type: integer
 *                     pos_x:
 *                       type: number
 *                     pos_y:
 *                       type: number
 *                     box_width:
 *                       type: number
 *                     box_height:
 *                       type: number
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Sai trạng thái hoặc thiếu người ký
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.put('/:id/signature-config', requireAuth, requireUserManager, proposalApprovalController.configureSignature);

module.exports = router;
