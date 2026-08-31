const fileService = require('../services/fileService');

exports.upload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Không có file nào được upload' });
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

exports.getById = async (req, res) => {
  try {
    const file = await fileService.getFileById(req.params.id);
    if (!file) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy file' });
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

    await fileService.deleteFile(req.params.id);
    res.json({ success: true, message: 'Xóa file thành công' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
