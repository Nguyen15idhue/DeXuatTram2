const express = require('express');
const router = express.Router();
const { requireAuth, requireUserManager } = require('../middlewares/auth');
const proposalReportController = require('../controllers/proposalReportController');

/**
 * @swagger
 * /api/admin/proposal-reports:
 *   get:
 *     tags: [Proposal Reports]
 *     summary: Danh sách đề xuất cho trang Lập tờ trình BCĐX
 *     description: >
 *       tab=all: PROPOSAL_REPORT_CREATING, PROPOSAL_REPORT_RE_CREATING, PROPOSAL_REPORT_REVIEWING,
 *       SIGNATURE_PENDING, COMPLETED, CANCELLED; tab=pending: PROPOSAL_REPORT_CREATING,
 *       PROPOSAL_REPORT_RE_CREATING; tab=completed: PROPOSAL_REPORT_REVIEWING, SIGNATURE_PENDING,
 *       COMPLETED, CANCELLED. Phân quyền theo vai trò: Admin/Super Admin và Back Office xem tất cả;
 *       GĐTTKD xem theo khu vực; SALES xem theo nhánh; CTV/NPP xem đề xuất của mình.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tab
 *         schema:
 *           type: string
 *           enum: [all, pending, completed]
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
router.get('/', requireAuth, requireUserManager, proposalReportController.list);

/**
 * @swagger
 * /api/admin/proposal-reports/{id}:
 *   put:
 *     tags: [Proposal Reports]
 *     summary: Tải lên file tờ trình BCĐX
 *     description: >
 *       Áp dụng cho đề xuất PROPOSAL_REPORT_CREATING, PROPOSAL_REPORT_RE_CREATING hoặc
 *       PROPOSAL_REPORT_UPDATING.
 *       Người tạo đề xuất hoặc GĐTTKD đúng khu vực (hoặc Admin) được tải lên.
 *       Bắt buộc gửi chot_so_luong_tru gồm mô hình, số lượng, loại trụ; server tự lấy giá hiện tại,
 *       tính tổng giá trị chốt. Sau khi tải lên, đề xuất chuyển sang PROPOSAL_REPORT_REVIEWING
 *       và thông báo Back Office.
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
 *             required: [files, chot_so_luong_tru]
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *               chot_so_luong_tru:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [mo_hinh, so_luong, loai_tru]
 *                   properties:
 *                     mo_hinh:
 *                       type: string
 *                       enum: [TDT, LK, NQ, NQ_LK]
 *                     so_luong:
 *                       type: integer
 *                       minimum: 1
 *                     loai_tru:
 *                       type: string
 *                     gia_chot:
 *                       type: number
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Sai trạng thái hoặc thiếu file/dữ liệu số lượng trụ chốt
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.put('/:id', requireAuth, requireUserManager, proposalReportController.upload);

/**
 * @swagger
 * /api/admin/proposal-reports/{id}/request-revision:
 *   put:
 *     tags: [Proposal Reports]
 *     summary: Back Office yêu cầu tạo lại tờ trình BCĐX
 *     description: >
 *       Áp dụng cho đề xuất PROPOSAL_REPORT_REVIEWING. Bắt buộc mô tả nội dung cần tạo lại;
 *       đề xuất chuyển sang PROPOSAL_REPORT_RE_CREATING và tạo Yêu cầu đề xuất loại REVISE_BCDX.
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
router.put('/:id/request-revision', requireAuth, requireUserManager, proposalReportController.requestRevision);

module.exports = router;
