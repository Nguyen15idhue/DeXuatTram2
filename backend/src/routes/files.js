const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middlewares/auth');
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

module.exports = router;
