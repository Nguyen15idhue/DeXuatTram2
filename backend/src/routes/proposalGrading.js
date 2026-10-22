const express = require('express');
const router = express.Router();
const { requireAuth, requireProposalManager } = require('../middlewares/auth');
const proposalGradingController = require('../controllers/proposalGradingController');

/**
 * @swagger
 * /api/admin/proposal-grading:
 *   get:
 *     tags: [Proposal Grading]
 *     summary: Danh sách đề xuất cho trang Đánh giá Quy hoạch và Pháp lý
 *     description: >
 *       tab=all: từ GRADING đến hết status flow (không gồm PENDING);
 *       tab=pending: đề xuất GRADING mà phòng của người dùng chưa chấm;
 *       tab=completed: đã chấm xong cả Quy hoạch và Pháp lý, từ sau GRADING đến hết flow.
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
 *         name: department
 *         schema:
 *           type: string
 *           enum: [QH, PL]
 *         description: Dùng cho ADMIN/SUPER_ADMIN khi xem tab pending (bỏ trống = cả 2 phòng)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm theo mã đề xuất, tên pháp nhân, SĐT, địa chỉ, người đề xuất
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
router.get('/', requireAuth, requireProposalManager, proposalGradingController.list);

/**
 * @swagger
 * /api/admin/proposal-grading/{id}:
 *   put:
 *     tags: [Proposal Grading]
 *     summary: Cập nhật điểm / đánh giá Quy hoạch hoặc Pháp lý
 *     description: >
 *       Phòng Quy hoạch chỉ cập nhật quy_hoach_score/quy_hoach_note;
 *       Phòng Pháp lý chỉ cập nhật phap_ly_score/phap_ly_note;
 *       ADMIN/SUPER_ADMIN cập nhật được cả 2. Khi cả 2 phòng đã chấm, hệ thống tự chuyển trạng thái.
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
 *               quy_hoach_score:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 3
 *                 nullable: true
 *               quy_hoach_note:
 *                 type: string
 *                 nullable: true
 *               phap_ly_score:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 3
 *                 nullable: true
 *               phap_ly_note:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc chưa đủ hồ sơ pháp lý
 *       403:
 *         description: Không có quyền cập nhật phòng ban này
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.put('/:id', requireAuth, requireProposalManager, proposalGradingController.update);

module.exports = router;
