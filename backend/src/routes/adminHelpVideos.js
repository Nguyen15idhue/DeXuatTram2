const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth, requireSuperAdmin } = require('../middlewares/auth');
const fileController = require('../controllers/fileController');

const uploadDir = path.join(__dirname, '../../storage/uploads');

const VIDEO_MIME_TO_EXT = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

const VIDEO_MIME_TYPES = Object.keys(VIDEO_MIME_TO_EXT);
const BLOCKED_EXTS = new Set(['.svg', '.html', '.htm', '.js', '.mjs', '.exe', '.php', '.phtml', '.sh', '.bat', '.cmd', '.msi', '.dll', '.jar', '.py', '.pl', '.cgi']);

const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const dir = path.join(uploadDir, 'help-videos', `${dd}-${mm}-${yyyy}`);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase().split(';')[0].trim();
    const ext = VIDEO_MIME_TO_EXT[mime] || '.mp4';
    const rand = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    cb(null, `${Date.now()}-${rand}${ext}`);
  },
});

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase().split(';')[0].trim();
    if (!VIDEO_MIME_TYPES.includes(mime)) {
      return cb(new Error('Chi chap nhan video mp4/webm/mov'));
    }
    const base = String(file.originalname || '').split(/[\\/]/).pop().toLowerCase();
    const parts = base.split('.');
    for (let i = 1; i < parts.length; i++) {
      if (BLOCKED_EXTS.has('.' + parts[i])) return cb(new Error('Ten file chua dinh dang bi chan'));
    }
    cb(null, true);
  },
});

/**
 * @swagger
 * /api/admin/help/videos:
 *   post:
 *     tags: [Help Admin]
 *     summary: Upload video huong dan noi bo (SUPER_ADMIN, toi da 200MB)
 *     description: Chi mp4/webm/mov. File luu thu muc help-videos/, xem qua /api/files/:id/download (ho tro Range 206, quyen theo vai tro bai viet).
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
 *               originalName:
 *                 type: string
 *     responses:
 *       201:
 *         description: Upload thanh cong
 *       400:
 *         description: File khong hop le hoac qua 200MB
 */
router.post('/', requireAuth, requireSuperAdmin, videoUpload.single('file'), fileController.upload);

router.use((err, req, res, next) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File vuot qua 200MB' });
  }
  if (err.message) {
    return res.status(400).json({ success: false, message: err.message });
  }
  return res.status(500).json({ success: false, message: 'Loi server' });
});

module.exports = router;
