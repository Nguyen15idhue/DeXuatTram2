const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const { guestUploadLimiter } = require('../middlewares/rateLimits');
const fileController = require('../controllers/fileController');
const fileService = require('../services/fileService');

const uploadDir = path.join(__dirname, '../../storage/uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const dateDir = `${dd}-${mm}-${yyyy}`;
    const dir = path.join(uploadDir, 'general', dateDir);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  preservePath: true
});

const GUEST_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

const guestUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  preservePath: true,
  fileFilter: (req, file, cb) => {
    if (GUEST_MIME_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Chỉ chấp nhận ảnh, PDF, Word'));
  }
});

/**
 * @swagger
 * /api/files/upload:
 *   post:
 *     tags: [Files]
 *     summary: Upload file
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
 *               subdir:
 *                 type: string
 *                 description: Thư mục con trong uploads/
 *     responses:
 *       201:
 *         description: Upload thành công
 *       400:
 *         description: Không có file
 *       401:
 *         description: Chưa xác thực
 */
router.post('/upload', requireAuth, upload.single('file'), fileController.upload);

/**
 * @swagger
 * /api/files/guest-upload:
 *   post:
 *     tags: [Files]
 *     summary: Khách vãng lai upload file (không cần đăng nhập)
 *     description: Chỉ ảnh, PDF, Word. Tối đa 5MB/file, 5 file/lần.
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
 *       201:
 *         description: Upload thành công
 *       400:
 *         description: File không hợp lệ
 *       429:
 *         description: Quá nhiều yêu cầu
 */
router.post('/guest-upload', guestUploadLimiter, guestUpload.single('file'), fileController.guestUpload);

/**
 * @swagger
 * /api/files/cleanup-orphans:
 *   post:
 *     tags: [Files]
 *     summary: Dọn file guest mồ côi quá hạn (Admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền Admin
 */
router.post('/cleanup-orphans', requireAuth, requireAdmin, fileController.cleanupOrphans);

/**
 * @swagger
 * /api/files/{id}:
 *   get:
 *     tags: [Files]
 *     summary: Lấy thông tin file
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
 *       401:
 *         description: Chưa xác thực
 *       404:
 *         description: Không tìm thấy file
 */
router.get('/:id', requireAuth, fileController.getById);

/**
 * @swagger
 * /api/files/{id}/download:
 *   get:
 *     tags: [Files]
 *     summary: Download file
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
 *         description: File binary
 *       401:
 *         description: Chưa xác thực
 *       404:
 *         description: Không tìm thấy file
 */
router.get('/:id/download', requireAuth, fileController.download);

/**
 * @swagger
 * /api/files/{id}/image:
 *   get:
 *     tags: [Files]
 *     summary: Xem file ảnh (public, không cần auth)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: File ảnh binary
 *       404:
 *         description: Không tìm thấy file
 */
router.get('/:id/image', async (req, res) => {
  try {
    const result = await fileService.getFilePath(req.params.id);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy file' });
    }
    const mime = result.file.mime_type || 'application/octet-stream';
    if (!mime.startsWith('image/')) {
      return res.status(400).json({ success: false, message: 'File không phải ảnh' });
    }
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(result.filePath);
  } catch (error) {
    console.error('Image file error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

/**
 * @swagger
 * /api/files/{id}:
 *   delete:
 *     tags: [Files]
 *     summary: Xóa file (soft delete + physical delete)
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
 *       401:
 *         description: Chưa xác thực
 *       404:
 *         description: Không tìm thấy file
 */
router.delete('/:id', requireAuth, fileController.delete);

router.use((err, req, res, next) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File vượt quá dung lượng cho phép' });
  }
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ success: false, message: 'Quá số lượng file cho phép' });
  }
  if (err.message) {
    return res.status(400).json({ success: false, message: err.message });
  }
  return res.status(500).json({ success: false, message: 'Lỗi server' });
});

module.exports = router;
