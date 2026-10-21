const path = require('path');
const signatureService = require('../services/signatureService');

const handleError = (res, err, actionLabel) => {
  console.error(`Signature ${actionLabel} error:`, err);
  if (err.message === 'NOT_FOUND') {
    return res.status(404).json({ success: false, message: 'Không tìm thấy chữ ký' });
  }
  if (err.message === 'FORBIDDEN') {
    return res.status(403).json({ success: false, message: 'Không có quyền truy cập chữ ký này' });
  }
  if (err.message === 'USER_NOT_FOUND') {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
  }
  return res.status(500).json({ success: false, message: 'Lỗi server' });
};

exports.getAll = async (req, res) => {
  try {
    const signatures = await signatureService.getAll(req.user);
    res.json({ success: true, data: signatures });
  } catch (err) {
    handleError(res, err, 'getAll');
  }
};

exports.checkManager = async (req, res) => {
  try {
    const isManager = await signatureService.isManagerUser(req.user);
    res.json({ success: true, data: { isManager } });
  } catch (err) {
    handleError(res, err, 'checkManager');
  }
};

exports.getByUserId = async (req, res) => {
  try {
    const signatures = await signatureService.getByUserId(req.user, parseInt(req.params.userId, 10));
    res.json({ success: true, data: signatures });
  } catch (err) {
    handleError(res, err, 'getByUserId');
  }
};

exports.getImage = async (req, res) => {
  try {
    const signature = await signatureService.getImage(parseInt(req.params.id, 10), req.user);
    res.sendFile(path.resolve(signature.file_path));
  } catch (err) {
    handleError(res, err, 'getImage');
  }
};

exports.upload = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'Chưa chọn file ảnh' });
    }

    const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.role);
    const targetUserId = isAdmin && req.body.user_id ? parseInt(req.body.user_id, 10) : req.user.id;

    const signature = await signatureService.upload(targetUserId, file);
    res.json({ success: true, data: signature });
  } catch (err) {
    handleError(res, err, 'upload');
  }
};

exports.remove = async (req, res) => {
  try {
    await signatureService.remove(parseInt(req.params.id, 10), req.user);
    res.json({ success: true, message: 'Đã xóa chữ ký' });
  } catch (err) {
    handleError(res, err, 'remove');
  }
};
