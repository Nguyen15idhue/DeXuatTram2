const express = require('express');
const multer = require('multer');
const { requireAuth, requireSuperAdmin } = require('../middlewares/auth');
const { excelLimiter } = require('../middlewares/rateLimits');
const { createTemplate } = require('../services/historicalOnImportSheet');
const service = require('../services/historicalOnImportPreview');
const { createProof } = require('../services/historicalOnImportProof');
const { executeConfirmation } = require('../services/historicalOnImportTransaction');
const { writeRow } = require('../services/historicalOnImportWriter');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
router.use(requireAuth, requireSuperAdmin, excelLimiter);

const handleError = (res, error) => {
  if (!error.statusCode || error.statusCode >= 500) console.error('[HistoricalOnImport]', error);
  res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Lỗi server khi xử lý file import' });
};
const receiveFile = (req, res, next) => {
  upload.single('file')(req, res, error => {
    if (error) return res.status(400).json({ success: false, message: error.code === 'LIMIT_FILE_SIZE' ? 'File vượt quá 10MB' : 'Không thể nhận file Excel' });
    if (!req.file || !/\.xlsx$/i.test(req.file.originalname)) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn file .xlsx' });
    }
    return next();
  });
};

/**
 * @swagger
 * /api/admin/historical-on-import/template:
 *   get:
 *     tags: [Admin - Excel]
 *     summary: Tải mẫu một sheet để chuẩn bị dữ liệu ON trạm cũ (SUPER_ADMIN)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: File Excel mẫu
 *       403:
 *         description: Không có quyền
 */
router.get('/template', async (req, res) => {
  try {
    const catalog = await service.loadCatalog();
    const workbook = await createTemplate(catalog.poles);
    const data = await workbook.xlsx.writeBuffer();
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', 'attachment; filename="import_tram_cu.xlsx"');
    res.send(Buffer.from(data));
  } catch (error) { handleError(res, error); }
});

/**
 * @swagger
 * /api/admin/historical-on-import/preview:
 *   post:
 *     tags: [Admin - Excel]
 *     summary: Kiểm tra sơ bộ file ON trạm cũ mà không ghi dữ liệu (SUPER_ADMIN)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Các dòng đối chiếu và proof xác nhận nếu mọi dòng hợp lệ
 *       400:
 *         description: File không hợp lệ
 *       403:
 *         description: Không có quyền
 */
router.post('/preview', receiveFile, async (req, res) => {
  try {
    const rows = await service.preview(req.file.buffer, req.user);
    const proof = rows.length && rows.every(row => !row.errors.length)
      ? createProof(req.file.buffer, req.user, rows) : null;
    return res.json({ success: true, data: { rows, import_available: Boolean(proof), proof } });
  } catch (error) { return handleError(res, error); }
});

/**
 * @swagger
 * /api/admin/historical-on-import/confirm:
 *   post:
 *     tags: [Admin - Excel]
 *     summary: Xác nhận import dữ liệu ON trạm cũ sau khi xem trước (SUPER_ADMIN)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, proof]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               proof:
 *                 type: string
 *     responses:
 *       200:
 *         description: Kết quả từng dòng đã ghi trong một transaction
 *       400:
 *         description: File hoặc proof không hợp lệ
 *       403:
 *         description: Không có quyền
 *       409:
 *         description: Dữ liệu đã thay đổi hoặc cần đối soát
 */
router.post('/confirm', receiveFile, async (req, res) => {
  try {
    if (typeof req.body.proof !== 'string' || !req.body.proof) {
      return res.status(400).json({ success: false, message: 'Thiếu phiên xem trước; hãy kiểm tra lại file' });
    }
    const data = await executeConfirmation({ buffer: req.file.buffer, proof: req.body.proof, actor: req.user, writeRow });
    return res.json({ success: true, data });
  } catch (error) { return handleError(res, error); }
});

module.exports = router;
