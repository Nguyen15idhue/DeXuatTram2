const express = require('express');
const router = express.Router();
const { requireAuth, requireUserManager } = require('../middlewares/auth');
const proposalDesignController = require('../controllers/proposalDesignController');

/**
 * @swagger
 * /api/admin/proposal-layouts:
 *   get:
 *     tags: [Proposal Layouts]
 *     summary: Danh sách đề xuất cho trang Đánh giá layout
 *     description: >
 *       tab=all: DESIGNING, INFOR_WAITING, PROPOSAL_REPORT_CREATING, PROPOSAL_REPORT_REVIEWING,
 *       SIGNATURE_PENDING, COMPLETED; tab=pending: DESIGNING; tab=waiting: INFOR_WAITING;
 *       tab=layout: PROPOSAL_REPORT_CREATING, PROPOSAL_REPORT_REVIEWING, SIGNATURE_PENDING, COMPLETED
 *       và CANCELLED đã từng duyệt bản vẽ layout.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tab
 *         schema:
 *           type: string
 *           enum: [all, pending, waiting, layout]
 *           default: all
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm mã đề xuất, pháp nhân, SĐT, địa chỉ, người đề xuất
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
router.get('/', requireAuth, requireUserManager, proposalDesignController.list);

/**
 * @swagger
 * /api/admin/proposal-layouts/{id}:
 *   put:
 *     tags: [Proposal Layouts]
 *     summary: Lưu bản vẽ layout và/hoặc duyệt layout
 *     description: >
 *       Chỉ áp dụng cho đề xuất DESIGNING. Gửi `approve=true` để duyệt và chuyển
 *       sang PROPOSAL_REPORT_CREATING (bắt buộc đã có ít nhất 1 file bản vẽ).
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
 *               files:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *               approve:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Sai trạng thái hoặc thiếu file
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.put('/:id', requireAuth, requireUserManager, proposalDesignController.update);

/**
 * @swagger
 * /api/admin/proposal-layouts/{id}/request-supplement:
 *   put:
 *     tags: [Proposal Layouts]
 *     summary: Yêu cầu người đề xuất bổ sung thông tin để vẽ layout
 *     description: >
 *       Chỉ áp dụng cho đề xuất DESIGNING. Bắt buộc mô tả; tạo Yêu cầu đề xuất loại
 *       LAYOUT_SUPPLEMENT và chuyển đề xuất sang INFOR_WAITING.
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
router.put('/:id/request-supplement', requireAuth, requireUserManager, proposalDesignController.requestSupplement);

/**
 * @swagger
 * /api/admin/proposal-layouts/{id}/cancel:
 *   put:
 *     tags: [Proposal Layouts]
 *     summary: Hủy đề xuất ở bước đánh giá layout
 *     description: Áp dụng cho đề xuất DESIGNING hoặc INFOR_WAITING. Bắt buộc nhập lý do.
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
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Sai trạng thái hoặc thiếu lý do
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.put('/:id/cancel', requireAuth, requireUserManager, proposalDesignController.cancel);

module.exports = router;
