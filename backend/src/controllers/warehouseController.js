const warehouseService = require('../services/warehouseService');

const sendError = (res, error) => {
  console.error('Warehouse error:', error);
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Lỗi server'
  });
};

const actorId = (req) => (req.user ? req.user.id : null);

exports.listPoles = async (req, res) => {
  try {
    const result = await warehouseService.listPoles(req.query);
    res.json({ success: true, data: result.items, pagination: result.pagination });
  } catch (error) { sendError(res, error); }
};

exports.createPole = async (req, res) => {
  try {
    const data = await warehouseService.createPole(req.body);
    res.status(201).json({ success: true, data, message: 'Đã thêm trụ sạc' });
  } catch (error) { sendError(res, error); }
};

exports.updatePole = async (req, res) => {
  try {
    const data = await warehouseService.updatePole(req.params.id, req.body);
    res.json({ success: true, data, message: 'Đã cập nhật trụ sạc' });
  } catch (error) { sendError(res, error); }
};

exports.deletePole = async (req, res) => {
  try {
    await warehouseService.deletePole(req.params.id);
    res.json({ success: true, message: 'Đã xóa trụ sạc' });
  } catch (error) { sendError(res, error); }
};

exports.listImports = async (req, res) => {
  try {
    const result = await warehouseService.listImports(req.query);
    res.json({ success: true, data: result.items, pagination: result.pagination });
  } catch (error) { sendError(res, error); }
};

exports.getImport = async (req, res) => {
  try {
    const data = await warehouseService.getImport(req.params.id);
    res.json({ success: true, data });
  } catch (error) { sendError(res, error); }
};

exports.createImport = async (req, res) => {
  try {
    const data = await warehouseService.createImport(req.body, { userId: actorId(req) });
    res.status(201).json({ success: true, data, message: 'Đã nhập kho' });
  } catch (error) { sendError(res, error); }
};

exports.listExports = async (req, res) => {
  try {
    const result = await warehouseService.listExports(req.query);
    res.json({ success: true, data: result.items, pagination: result.pagination });
  } catch (error) { sendError(res, error); }
};

exports.getExport = async (req, res) => {
  try {
    const data = await warehouseService.getExport(req.params.id);
    res.json({ success: true, data });
  } catch (error) { sendError(res, error); }
};

exports.createExport = async (req, res) => {
  try {
    const data = await warehouseService.createExport(req.body, { userId: actorId(req) });
    res.status(201).json({ success: true, data, message: 'Đã xuất kho' });
  } catch (error) { sendError(res, error); }
};

exports.getStock = async (req, res) => {
  try {
    const data = await warehouseService.getStock(req.query);
    res.json({ success: true, data });
  } catch (error) { sendError(res, error); }
};
