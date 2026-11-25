const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireAuth, requireProposalReportManager, requireProposalInfoManager } = require('../middlewares/auth');
const proposalReportController = require('../controllers/proposalReportController');
const reportDocuments = require('../controllers/proposalReportDocumentController');
const generatedPdfUpload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 1 }
}).single('file');
let pendingGeneratedUploads = 0;

/**
 * @swagger
 * /api/admin/proposal-reports:
 *   get:
 *     tags: [Proposal Reports]
 *     summary: Danh sách đề xuất cho trang Lập tờ trình BCĐX
 *     description: >
 *       tab=all: PROPOSAL_REPORT_CREATING, PROPOSAL_REPORT_RE_CREATING, PROPOSAL_REPORT_UPDATING,
 *       PROPOSAL_REPORT_REVIEWING, SIGNATURE_PENDING, APPROVED, CANCELLED; tab=pending:
 *       PROPOSAL_REPORT_CREATING, PROPOSAL_REPORT_RE_CREATING, PROPOSAL_REPORT_UPDATING;
 *       tab=completed: PROPOSAL_REPORT_REVIEWING, SIGNATURE_PENDING,
 *       APPROVED, CANCELLED. Hỗ trợ lọc theo status, model, province, region, owner, manager, date.
 *       Phân quyền theo vai trò: Admin/Super Admin và Back Office xem tất cả;
 *       TGĐ chỉ xem, tab=pending trả rỗng và không được upload/cập nhật BCĐX;
 *       GĐTTKD xem và xử lý theo nhánh, phòng ban hoặc phân công quản lý, không theo miền địa điểm;
 *       ADMIN vẫn xem tất cả nhưng task và thao tác theo phạm vi nghiệp vụ.
 *       SALES xem theo nhánh; NPP xem theo phạm vi được phân công.
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
 *         name: proposal_status
 *         schema:
 *           type: string
 *       - in: query
 *         name: model
 *         schema:
 *           type: string
 *       - in: query
 *         name: province
 *         schema:
 *           type: string
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *       - in: query
 *         name: owner_user_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: manager_user_id
 *         schema:
 *           type: integer
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
 *           default: 10
 *     responses:
 *       200:
 *         description: Thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền
 */
router.get('/', requireAuth, requireProposalReportManager, proposalReportController.list);

/**
 * @swagger
 * /api/admin/proposal-reports/filter-options:
 *   get:
 *     tags: [Proposal Reports]
 *     summary: Tùy chọn bộ lọc đề xuất BCĐX
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */
router.get('/filter-options', requireAuth, requireProposalReportManager, proposalReportController.filterOptions);

/**
 * @swagger
 * /api/admin/proposal-reports/{id}/documents:
 *   get:
 *     tags: [Proposal Reports]
 *     summary: Tài liệu gốc, PDF cố định và lỗi chuyển đổi BCĐX
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: Danh sách tài liệu hiện hành }
 *       403: { description: Ngoài phạm vi đề xuất }
 * /api/admin/proposal-reports/{id}/documents/prepare:
 *   post:
 *     tags: [Proposal Reports]
 *     summary: Chuẩn bị PDF cho tối đa 10 Word/PDF trước khi nộp BCĐX
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [files]
 *             properties:
 *               files: { type: array, items: { type: object, properties: { id: { type: integer } } } }
 *     responses:
 *       200: { description: Đăng ký tài liệu gốc; PDF READY, Word PENDING để chuyển nền sau khi gửi duyệt }
 *       403: { description: Không có quyền nộp }
 * /api/admin/proposal-reports/{id}/documents/{documentId}/convert:
 *   post:
 *     tags: [Proposal Reports]
 *     summary: Thử chuyển Word sang PDF; chặn nếu đã cấu hình hoặc ký
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: documentId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Trạng thái chuyển đổi; lỗi nằm trong conversion_error }
 *       409: { description: Đã cấu hình ký hoặc sai bước }
 */
router.get('/:id/documents', requireAuth, requireProposalReportManager, reportDocuments.list);
router.post('/:id/documents/prepare', requireAuth, requireProposalReportManager, reportDocuments.prepare);
router.post('/:id/documents/:documentId/convert', requireAuth, requireProposalReportManager, reportDocuments.convert);

/**
 * @swagger
 * /api/admin/proposal-reports/{id}:
 *   get:
 *     tags: [Proposal Reports]
 *     summary: Chi tiết đề xuất trong quy trình lập tờ trình BCĐX
 *     description: Phân quyền xem giống danh sách Lập tờ trình BCĐX; trả dữ liệu form, layout, yêu cầu và lịch sử hoạt động.
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
 *       403:
 *         description: Không có quyền xem
 *       404:
 *         description: Không tìm thấy đề xuất
 */
router.get('/:id', requireAuth, requireProposalReportManager, proposalReportController.detail);

/**
 * @swagger
 * /api/admin/proposal-reports/{id}:
 *   put:
 *     tags: [Proposal Reports]
 *     summary: Tải lên file tờ trình BCĐX
 *     description: >
 *       Áp dụng cho đề xuất PROPOSAL_REPORT_CREATING, PROPOSAL_REPORT_RE_CREATING hoặc
 *       PROPOSAL_REPORT_UPDATING.
 *       SUPER_ADMIN, người tạo đề xuất, quản lý trực tiếp hoặc GĐTTKD đúng khu vực được tải lên.
 *       File chỉ nhận Word (.doc, .docx) hoặc PDF.
 *       Bắt buộc gửi chot_so_luong_tru gồm mô hình, số lượng, loại trụ; server tự lấy giá hiện tại,
 *       tính tổng giá trị chốt và cập nhật mô hình đề xuất theo bảng chốt (ưu tiên LK/NQ khi kèm TDT).
 *       Chỉ TDT → TDT; có LK và NQ → NQ_LK; chỉ có một trong LK/NQ → mô hình tương ứng.
 *       Giữ nguyên mã đề xuất. Sau khi tải lên, đề xuất chuyển sang PROPOSAL_REPORT_REVIEWING.
 *       Word tự chuyển PDF trong nền; không chặn gửi duyệt bởi trạng thái chuyển đổi.
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
 *                       enum: [TDT, LK, NQ]
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
router.put('/:id', requireAuth, requireProposalReportManager, proposalReportController.upload);
/**
 * @swagger
 * /api/admin/proposal-reports/{id}/generate:
 *   post:
 *     tags: [Proposal Reports]
 *     summary: Gửi duyệt đúng PDF đã xem thử từ mẫu
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, proof]
 *             properties:
 *               file: { type: string, format: binary }
 *               proof: { type: string }
 *     responses:
 *       200: { description: Đã lưu tài liệu và chuyển sang duyệt }
 *       400: { description: Bản xem thử còn thiếu thông tin bắt buộc }
 *       403: { description: Không có quyền }
 *       409: { description: Bản xem thử hết hạn hoặc dữ liệu đã thay đổi }
 */
router.post('/:id/generate', requireAuth, requireProposalReportManager, (req, res, next) => {
  if (pendingGeneratedUploads >= 3) {
    return res.status(429).json({ success: false, message: 'Hệ thống đang xử lý nhiều BCĐX, vui lòng thử lại sau' });
  }
  pendingGeneratedUploads += 1;
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      pendingGeneratedUploads -= 1;
    }
  };
  res.once('finish', release);
  res.once('close', release);
  generatedPdfUpload(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        success: false,
        message: error.code === 'LIMIT_FILE_SIZE' ? 'PDF BCĐX vượt quá 20 MB' : 'Dữ liệu gửi BCĐX không hợp lệ'
      });
    }
    return next(error);
  });
}, proposalReportController.generate);

/**
 * @swagger
 * /api/admin/proposal-reports/{id}/generation-options:
 *   get:
 *     tags: [Proposal Reports]
 *     summary: Danh sách mẫu và trường có thể sửa để xem thử BCĐX
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: Các mẫu phù hợp với mô hình đề xuất }
 *       403: { description: Không có quyền lập tờ trình }
 *       409: { description: Đề xuất không ở bước lập tờ trình }
 */
router.get('/:id/generation-options', requireAuth, requireProposalReportManager, proposalReportController.generationOptions);

/**
 * @swagger
 * /api/admin/proposal-reports/{id}/generation-draft:
 *   put:
 *     tags: [Proposal Reports]
 *     summary: Lưu trụ chốt và ngày dự kiến ON trước khi lập BCĐX
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [chot_so_luong_tru, ngay_du_kien_on, revision]
 *             properties:
 *               chot_so_luong_tru: { type: array, items: { type: object } }
 *               ngay_du_kien_on: { type: string, format: date }
 *               revision: { type: string }
 *     responses:
 *       200: { description: Đã lưu dữ liệu, chưa gửi duyệt }
 *       400: { description: Dữ liệu không hợp lệ }
 *       403: { description: Không có quyền }
 *       409: { description: Trạng thái hoặc dữ liệu đã thay đổi }
 */
router.put('/:id/generation-draft', requireAuth, requireProposalReportManager, proposalReportController.saveGenerationDraft);

/**
 * @swagger
 * /api/admin/proposal-reports/{id}/generation-preview:
 *   post:
 *     tags: [Proposal Reports]
 *     summary: Xem thử PDF từ mẫu mà không lưu hoặc gửi duyệt
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: query, name: format, schema: { type: string, enum: [json] }, description: Trả PDF base64, cảnh báo và bằng chứng xác nhận trong JSON }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [template_id, values]
 *             properties:
 *               template_id: { type: integer }
 *               values: { type: object, additionalProperties: { type: string } }
 *               inputs:
 *                 type: object
 *                 description: Giá trị nhập riêng BCĐX theo token source=input trong mapping; không lưu vào đề xuất
 *                 additionalProperties: { type: string }
 *               saved_draft_revision:
 *                 type: string
 *                 description: Phiên bản trụ chốt và ngày ON đã lưu; bản xem thử dùng dữ liệu này nếu được truyền
 *               chot_so_luong_tru:
 *                 type: array
 *                 description: Các dòng trụ chốt dùng riêng cho bản xem thử; giá và thành tiền tính theo danh mục hiện tại, không lưu vào đề xuất
 *                 items:
 *                   type: object
 *                   required: [mo_hinh, so_luong, loai_tru]
 *                   properties:
 *                     mo_hinh: { type: string, enum: [TDT, LK, NQ] }
 *                     so_luong: { type: integer, minimum: 1 }
 *                     loai_tru: { type: string }
 *                     ghi_chu: { type: string }
 *     responses:
 *       200:
 *         description: PDF xem thử hoặc JSON chứa PDF và cảnh báo; không thay đổi đề xuất
 *         content:
 *           application/pdf: { schema: { type: string, format: binary } }
 *           application/json: { schema: { type: object } }
 *       400: { description: Mẫu hoặc dữ liệu không hợp lệ }
 *       403: { description: Không có quyền lập tờ trình }
 *       409: { description: Đề xuất không ở bước lập tờ trình }
 */
router.post('/:id/generation-preview', requireAuth, requireProposalReportManager, proposalReportController.generationPreview);

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
router.put('/:id/request-revision', requireAuth, requireProposalReportManager, proposalReportController.requestRevision);

module.exports = router;
