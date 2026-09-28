const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const { validateUpdateProposal } = require('../middlewares/validators');
const myProposalController = require('../controllers/myProposalController');
const excelService = require('../services/excelService');

/**
 * @swagger
 * /api/my-proposals:
 *   get:
 *     tags: [My Proposals]
 *     summary: Lấy danh sách đề xuất của user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, REVIEWING, PRINCIPLE_APPROVED, APPROVED, REJECTED, CANCELLED, CONTRACT_SIGNED, CONTRACT_FAILED, ARCHIVED]
  *       - in: query
  *         name: filters
  *         schema:
  *           type: string
  *         description: Lọc theo cột dạng JSON (VD {"owner_name":"abc"}) — tìm trên toàn bộ database, không chỉ trang hiện tại
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Proposal'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         description: Chưa xác thực
 */
router.get('/', requireAuth, myProposalController.getAll);

/**
 * @swagger
 * /api/my-proposals/duplicates:
 *   get:
 *     tags: [My Proposals]
 *     summary: Tìm đề xuất của tôi trùng lặp theo khoảng cách
 *     description: So tọa độ đề xuất của user với toàn bộ đề xuất (trừ REJECTED) và toàn bộ trạm. Khoảng cách Haversine, tính bằng mét.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: min_m
 *         schema:
 *           type: number
 *           default: 200
 *         description: Khoảng cách tối thiểu (m)
 *       - in: query
 *         name: max_m
 *         schema:
 *           type: number
 *           default: 2000
 *         description: Khoảng cách tối đa (m, tối đa 5000)
 *     responses:
 *       200:
 *         description: Thành công
 *       400:
 *         description: Tham số không hợp lệ
 *       401:
 *         description: Chưa xác thực
 */
router.get('/duplicates', requireAuth, myProposalController.duplicates);

/**
 * @swagger
 * /api/my-proposals/duplicates/export:
 *   post:
 *     tags: [My Proposals]
 *     summary: Xuất file Excel 3 sheets cho đề xuất trùng của tôi
 *     description: Sheet ketqua (Bên A, Bên B, Khoảng cách) + sheet Ben A + sheet Ben B. Chỉ các cặp liên quan đề xuất của user.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               min_m:
 *                 type: number
 *                 default: 200
 *               max_m:
 *                 type: number
 *                 default: 2000
 *     responses:
 *       200:
 *         description: File Excel
 *       400:
 *         description: Tham số không hợp lệ
 *       401:
 *         description: Chưa xác thực
 */
router.post('/duplicates/export', requireAuth, (req, res) => excelService.exportDuplicates(req, res, req.user.id));

/**
 * @swagger
 * /api/my-proposals/{id}:
 *   put:
 *     tags: [My Proposals]
 *     summary: Cập nhật đề xuất của mình
 *     description: Chỉ cập nhật được đề xuất có trạng thái PENDING
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
 *             required: [owner_name, owner_phone, address]
 *             properties:
 *               owner_name:
 *                 type: string
 *               owner_phone:
 *                 type: string
 *               address:
 *                 type: string
 *               area:
 *                 type: string
 *               land_type:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Trạng thái không phải PENDING hoặc dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       404:
 *         description: Không tìm thấy đề xuất hoặc không phải của user
 */
router.put('/:id', requireAuth, validateUpdateProposal, myProposalController.update);

/**
 * @swagger
 * /api/my-proposals/{id}/confirm-info:
 *   post:
 *     tags: [My Proposals]
 *     summary: Xác nhận đề xuất của mình đã đủ thông tin (thông báo tới admin)
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
 *         description: Xác nhận thành công
 *       400:
 *         description: Đề xuất không trong thời gian bổ sung thông tin
 *       404:
 *         description: Không tìm thấy đề xuất hoặc không phải của user
 */
router.post('/:id/confirm-info', requireAuth, myProposalController.confirmInfo);

/**
 * @swagger
 * /api/my-proposals/{id}/reopen-info:
 *   post:
 *     tags: [My Proposals]
 *     summary: Mở lại đề xuất của mình để bổ sung tiếp (giữ deadline cũ)
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
 *         description: Mở lại thành công
 *       400:
 *         description: Đề xuất không trong thời gian bổ sung thông tin
 *       404:
 *         description: Không tìm thấy đề xuất hoặc không phải của user
 */
router.post('/:id/reopen-info', requireAuth, myProposalController.reopenInfo);

/**
 * @swagger
 * /api/my-proposals/{id}/extend-deadline:
 *   post:
 *     tags: [My Proposals]
 *     summary: Gia hạn thời gian bổ sung thông tin cho đề xuất của mình
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
 *               days:
 *                 type: integer
 *                 default: 0
 *                 description: Số ngày gia hạn (0-30)
 *               hours:
 *                 type: integer
 *                 default: 0
 *                 description: Số giờ gia hạn (0-23)
 *               reason:
 *                 type: string
 *                 description: Lý do gia hạn (bắt buộc)
 *     responses:
 *       200:
 *         description: Gia hạn thành công
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc đề xuất đã quá hạn
 *       404:
 *         description: Không tìm thấy đề xuất hoặc không phải của user
 */
router.post('/:id/extend-deadline', requireAuth, myProposalController.extendDeadline);

/**
 * @swagger
 * /api/my-proposals/{id}:
 *   delete:
 *     tags: [My Proposals]
 *     summary: Xóa đề xuất của mình
 *     description: Chỉ xóa được đề xuất có trạng thái PENDING
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
 *         description: Xóa thành công
 *       400:
 *         description: Trạng thái không phải PENDING
 *       401:
 *         description: Chưa xác thực
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.delete('/:id', requireAuth, myProposalController.delete);

/**
 * @swagger
 * /api/my-proposals/export:
 *   get:
 *     tags: [My Proposals]
 *     summary: Xuất danh sách đề xuất của user ra file Excel
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Lọc theo tên, địa chỉ (bỏ trống = tất cả)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, REVIEWING, PRINCIPLE_APPROVED, APPROVED, REJECTED, CANCELLED, CONTRACT_SIGNED, CONTRACT_FAILED, ARCHIVED]
 *         description: Lọc theo trạng thái (bỏ trống = tất cả)
 *     responses:
 *       200:
 *         description: File Excel
 *       401:
 *         description: Chưa xác thực
 */
router.get('/export', requireAuth, (req, res) => {
  req.query.entity = 'station_proposals';
  req.query.scopeUserId = req.user.id;
  return excelService.exportDynamic(req, res);
});

module.exports = router;
