const fileService = require('../services/fileService');
const pool = require('../utils/db');
const fs = require('fs');

const verifyMagic = (filePath, mime) => {
  let buf;
  try {
    const fd = fs.openSync(filePath, 'r');
    buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
  } catch { return false; }
  if (mime === 'image/png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  if (mime === 'image/jpeg') return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  if (mime === 'image/gif') return buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a';
  if (mime === 'image/webp') return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  if (mime === 'application/pdf') return buf.toString('ascii', 0, 4) === '%PDF';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
  if (mime === 'application/msword' || mime === 'application/vnd.ms-excel') return (buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0) || (buf[0] === 0x50 && buf[1] === 0x4B);
  return true;
};

const removePhysical = (p) => { try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch { /* silent */ } };

const canAccessFile = async (file, req) => {
  if (!file) return false;
  let requesterId = req.user ? req.user.id : null;
  let requesterRole = req.user ? req.user.role : null;
  if (requesterId && !requesterRole) {
    try {
      const [rows] = await pool.query('SELECT role FROM users WHERE id = ?', [requesterId]);
      if (rows.length > 0) requesterRole = rows[0].role;
    } catch { /* silent */ }
  }
  if (requesterId && ['ADMIN', 'SUPER_ADMIN'].includes(requesterRole)) return true;
  if (requesterId && file.uploaded_by !== null && file.uploaded_by !== undefined && Number(file.uploaded_by) === Number(requesterId)) return true;
  const reqIp = req.ip || req.connection?.remoteAddress || null;
  if (file.uploaded_by === null && file.submitter_ip && reqIp && file.submitter_ip === reqIp) return true;
  return false;
};

exports.canAccessFile = canAccessFile;

exports.upload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Không có file nào được upload' });
    }
    const mime = String(req.file.mimetype || '').toLowerCase().split(';')[0].trim();
    if (!verifyMagic(req.file.path, mime)) {
      removePhysical(req.file.path);
      return res.status(400).json({ success: false, message: 'Nội dung file không khớp định dạng' });
    }

    const userId = req.user ? req.user.id : null;
    const originalNameOverride = req.body.originalName || null;
    const file = await fileService.uploadFile(req.file, userId, originalNameOverride);

    res.status(201).json({
      success: true,
      data: file,
      message: 'Upload file thành công'
    });
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.guestUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Không có file nào được upload' });
    }
    const mime = String(req.file.mimetype || '').toLowerCase().split(';')[0].trim();
    if (!verifyMagic(req.file.path, mime)) {
      removePhysical(req.file.path);
      return res.status(400).json({ success: false, message: 'Nội dung file không khớp định dạng' });
    }

    const ip = req.ip || req.connection?.remoteAddress || null;
    const file = await fileService.uploadFile(req.file, null, null, ip);

    res.status(201).json({
      success: true,
      data: file,
      message: 'Upload file thành công'
    });
  } catch (error) {
    console.error('Guest upload file error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.cleanupOrphans = async (req, res) => {
  try {
    const ttl = Number(process.env.ORPHAN_FILE_TTL_HOURS) || 24;
    const result = await fileService.cleanupOrphanGuestFiles(ttl);
    res.json({ success: true, data: result, message: `Đã dọn ${result.deleted} file mồ côi` });
  } catch (error) {
    console.error('Cleanup orphans error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getById = async (req, res) => {
  try {
    const file = await fileService.getFileById(req.params.id);
    if (!file) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy file' });
    }
    if (file.uploaded_by !== req.user.id && !['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
    }
    res.json({ success: true, data: file });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.download = async (req, res) => {
  try {
    const result = await fileService.getFilePath(req.params.id);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy file' });
    }
    const allowed = await canAccessFile(result.file, req);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
    }

    const mime = result.file.mime_type || 'application/octet-stream';
    const charset = mime.startsWith('text/') || mime.includes('json') || mime.includes('xml') ? '; charset=utf-8' : '';
    res.setHeader('Content-Type', mime + charset);

    const originalName = result.file.original_name || 'download';
    const safeName = originalName.replace(/[^\w\s.\-()]/g, '_');
    const encodedName = encodeURIComponent(originalName);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`);

    res.sendFile(result.filePath);
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.delete = async (req, res) => {
  try {
    const file = await fileService.getFileById(req.params.id);
    if (!file) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy file' });
    }
    if (file.uploaded_by !== req.user.id && !['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập tài nguyên này' });
    }

    await fileService.deleteFile(req.params.id);
    res.json({ success: true, message: 'Xóa file thành công' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
