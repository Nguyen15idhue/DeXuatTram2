const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middlewares/auth');
const signatureController = require('../controllers/signatureController');

const uploadDir = path.join(__dirname, '../../storage/uploads/signatures');

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const BLOCKED_EXTENSIONS = [
  '.svg',
  '.html',
  '.htm',
  '.js',
  '.mjs',
  '.exe',
  '.php',
  '.phtml',
  '.sh',
  '.bat',
  '.cmd',
  '.msi',
  '.dll',
  '.jar',
  '.py',
  '.pl',
  '.cgi',
];

const checkUploadFile = (file, allowedMimes) => {
  const mime = String(file.mimetype || '').toLowerCase().split(';')[0].trim();
  if (!allowedMimes.includes(mime)) return false;
  const base = String(file.originalname || '').split(/[\\/]/).pop() || '';
  const parts = base.toLowerCase().split('.');
  for (let i = 1; i < parts.length; i++) {
    if (BLOCKED_EXTENSIONS.includes('.' + parts[i])) return false;
  }
  return true;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const dir = path.join(uploadDir, `${dd}-${mm}-${yyyy}`);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase().split(';')[0].trim();
    const extMap = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
    };
    const rand = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    cb(null, `${Date.now()}-${rand}${extMap[mime] || '.jpg'}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (checkUploadFile(file, IMAGE_MIME_TYPES)) {
      cb(null, true);
    } else {
      cb(new Error('File không hợp lệ (chỉ ảnh JPG/PNG/GIF/WebP, tối đa 2MB)'));
    }
  },
});

/**
 * @swagger
 * /api/admin/signatures:
 *   get:
 *     summary: Danh sách chữ ký số theo phạm vi người dùng
 *     tags: [Signatures]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách chữ ký
 */
router.get('/', requireAuth, signatureController.getAll);

/**
 * @swagger
 * /api/admin/signatures/check-manager:
 *   get:
 *     summary: Kiểm tra người dùng có phải quản lý (có nhân viên trực thuộc) hay không
 *     tags: [Signatures]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trả về { isManager }
 */
router.get('/check-manager', requireAuth, signatureController.checkManager);

router.get('/user/:userId', requireAuth, signatureController.getByUserId);

router.get('/:id/image', requireAuth, signatureController.getImage);

router.post('/upload', requireAuth, upload.single('file'), signatureController.upload);

router.delete('/:id', requireAuth, signatureController.remove);

module.exports = router;
