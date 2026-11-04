const supplierService = require('../services/supplierService');

const sendError = (res, error) => {
  console.error('Supplier error:', error);
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Lỗi server'
  });
};

exports.list = async (req, res) => {
  try {
    const result = await supplierService.listSuppliers(req.query);
    res.json({ success: true, data: result.items, pagination: result.pagination });
  } catch (error) { sendError(res, error); }
};

exports.detail = async (req, res) => {
  try {
    const data = await supplierService.getSupplier(req.params.id);
    res.json({ success: true, data });
  } catch (error) { sendError(res, error); }
};

exports.create = async (req, res) => {
  try {
    const data = await supplierService.createSupplier(req.body);
    res.status(201).json({ success: true, data, message: 'Đã thêm nhà cung cấp' });
  } catch (error) { sendError(res, error); }
};

exports.update = async (req, res) => {
  try {
    const data = await supplierService.updateSupplier(req.params.id, req.body);
    res.json({ success: true, data, message: 'Đã cập nhật nhà cung cấp' });
  } catch (error) { sendError(res, error); }
};

exports.assignPole = async (req, res) => {
  try {
    await supplierService.assignPole(req.params.id, req.body.pole_id, req.body.quantity);
    res.json({ success: true, message: 'Đã gán loại trụ cho nhà cung cấp' });
  } catch (error) { sendError(res, error); }
};

exports.poles = async (req, res) => {
  try {
    const data = await supplierService.listPolesBySupplier(req.params.id);
    res.json({ success: true, data });
  } catch (error) { sendError(res, error); }
};
exports.syncPoles = async (req, res) => {
  try {
    const poleId = req.body?.pole_id || req.params.id;
    await supplierService.syncPoleSuppliers(poleId, req.body?.suppliers || []);
    res.json({ success: true, message: 'Đã cập nhật nhà cung cấp cho loại trụ' });
  } catch (error) { sendError(res, error); }
};
