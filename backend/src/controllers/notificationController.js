const notificationService = require('../services/notificationService');

exports.getAll = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const result = await notificationService.listByUser(req.user.id, page, limit);
    res.json({
      success: true,
      data: result.items,
      pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const count = await notificationService.unreadCount(req.user.id);
    res.json({ success: true, data: { count } });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getAllAdmin = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const result = await notificationService.listAll(page, limit);
    res.json({
      success: true,
      data: result.items,
      pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) }
    });
  } catch (error) {
    console.error('Get all notifications error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.markRead = async (req, res) => {
  try {
    await notificationService.markRead(req.user.id, parseInt(req.params.id));
    res.json({ success: true, message: 'Đã đánh dấu đã đọc' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await notificationService.markAllRead(req.user.id);
    res.json({ success: true, message: 'Đã đánh dấu tất cả đã đọc' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
