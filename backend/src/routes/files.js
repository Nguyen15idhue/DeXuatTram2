const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middlewares/auth');
const fileController = require('../controllers/fileController');

const uploadDir = path.join(__dirname, '../../storage/uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subDir = req.body.subdir || 'general';
    const dir = path.join(uploadDir, subDir);
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
