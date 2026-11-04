const ExcelJS = require('exceljs');
const pool = require('../utils/db');

const fileName = (resource) => `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}_warehouse_${resource}.xlsx`;

const build = async (resource, query = {}) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Du lieu kho');
  let headers = [];
  let rows = [];

  if (resource === 'poles') {
    headers = ['STT', 'Tên loại trụ', 'Loại sạc', 'Công suất (kW)', 'Nhà cung cấp', 'Ghi chú'];
    const [data] = await pool.query(`
      SELECT cp.name, cp.charging_type, cp.power_kw, cp.note,
             GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ') AS suppliers
      FROM charging_poles cp
      LEFT JOIN supplier_charging_poles scp ON scp.charging_pole_id = cp.id
      LEFT JOIN suppliers s ON s.id = scp.supplier_id
      GROUP BY cp.id ORDER BY cp.name`);
    rows = data.map((r, i) => [i + 1, r.name, r.charging_type, Number(r.power_kw), r.suppliers || '', r.note || '']);
  } else if (resource === 'stock') {
    headers = ['STT', 'Loại sạc', 'Công suất (kW)', 'Tổng tồn kho'];
    const [data] = await pool.query(`SELECT cp.charging_type, cp.power_kw, SUM(scp.quantity) AS total_quantity FROM supplier_charging_poles scp JOIN charging_poles cp ON cp.id = scp.charging_pole_id GROUP BY cp.charging_type, cp.power_kw ORDER BY cp.charging_type, cp.power_kw`);
    rows = data.map((r, i) => [i + 1, r.charging_type, Number(r.power_kw), Number(r.total_quantity || 0)]);
  } else if (resource === 'stock-detail') {
    headers = ['STT', 'Nhà cung cấp', 'Tên loại trụ', 'Loại sạc', 'Công suất (kW)', 'Số lượng tồn'];
    const where = [];
    const params = [];
    if (query.type) { where.push('cp.charging_type = ?'); params.push(String(query.type)); }
    if (query.power) { where.push('cp.power_kw = ?'); params.push(Number(query.power)); }
    const [data] = await pool.query(`SELECT s.name AS supplier_name, cp.name, cp.charging_type, cp.power_kw, scp.quantity FROM supplier_charging_poles scp JOIN suppliers s ON s.id=scp.supplier_id JOIN charging_poles cp ON cp.id=scp.charging_pole_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY cp.charging_type, cp.power_kw, s.name`, params);
    rows = data.map((r, i) => [i + 1, r.supplier_name, r.name, r.charging_type, Number(r.power_kw), Number(r.quantity || 0)]);
  } else if (resource === 'imports') {
    headers = ['STT', 'Mã phiếu', 'Ngày nhập', 'Người nhập', 'Trạm liên quan', 'Nhà cung cấp', 'Loại trụ', 'Loại sạc', 'Công suất (kW)', 'Số lượng', 'Ghi chú'];
    const [data] = await pool.query(`SELECT wi.id, wi.import_date, u.full_name AS importer_name, cp.ma_tram, s.name AS supplier_name, p.name AS pole_name, p.charging_type, p.power_kw, wii.quantity, wi.note FROM warehouse_imports wi JOIN users u ON u.id=wi.importer_user_id LEFT JOIN charging_stations cp ON cp.id=wi.charging_station_id JOIN warehouse_import_items wii ON wii.import_id=wi.id JOIN charging_poles p ON p.id=wii.pole_id LEFT JOIN suppliers s ON s.id=wii.supplier_id ORDER BY wi.id DESC`);
    rows = data.map((r, i) => [i + 1, r.id, r.import_date, r.importer_name, r.ma_tram || '', r.supplier_name || '', r.pole_name, r.charging_type, Number(r.power_kw), r.quantity, r.note || '']);
  } else if (resource === 'exports') {
    headers = ['STT', 'Mã phiếu', 'Ngày xuất', 'Người xuất', 'Loại nơi nhận', 'Nơi nhận', 'Địa chỉ nơi nhận', 'Nhà cung cấp', 'Loại trụ', 'Loại sạc', 'Công suất (kW)', 'Số lượng', 'Lý do', 'Bên vận chuyển', 'Mã vận chuyển', 'Trạng thái vận chuyển', 'Tổng tiền'];
    const [data] = await pool.query(`SELECT we.id, we.export_date, u.full_name AS exporter_name, we.destination_type, COALESCE(cs.ma_tram, we.destination_name) AS destination_name, we.destination_address, s.name AS supplier_name, p.name AS pole_name, p.charging_type, p.power_kw, wei.quantity, we.reason, we.carrier, we.transport_code, we.transport_status, we.total_amount FROM warehouse_exports we JOIN users u ON u.id=we.exporter_user_id LEFT JOIN charging_stations cs ON cs.id=we.charging_station_id JOIN warehouse_export_items wei ON wei.export_id=we.id JOIN charging_poles p ON p.id=wei.pole_id LEFT JOIN suppliers s ON s.id=wei.supplier_id ORDER BY we.id DESC`);
    rows = data.map((r, i) => [i + 1, r.id, r.export_date, r.exporter_name, r.destination_type, r.destination_name || '', r.destination_address || '', r.supplier_name || '', r.pole_name, r.charging_type, Number(r.power_kw), r.quantity, r.reason || '', r.carrier || '', r.transport_code || '', r.transport_status || '', r.total_amount ?? '']);
  } else {
    throw Object.assign(new Error('Loại xuất Excel không hợp lệ'), { statusCode: 400 });
  }

  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F35E8' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + Math.min(headers.length, 26))}1` };
  sheet.columns.forEach((column) => { column.width = Math.min(36, Math.max(12, (column.header || '').length + 4)); });
  return { workbook, filename: fileName(resource) };
};

exports.export = async (req, res) => {
  try {
    const result = await build(req.params.resource, req.query);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${result.filename}`);
    await result.workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Warehouse Excel error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Xuất Excel thất bại' });
  }
};
