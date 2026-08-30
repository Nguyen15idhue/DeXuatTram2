const ExcelJS = require('exceljs');
const multer = require('multer');
const pool = require('../utils/db');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const VALID_STATION_STATUSES = ['ACTIVE', 'DEPLOYING'];

exports.uploadMiddleware = upload.single('file');

exports.exportStations = async (req, res) => {
  try {
    const [stations] = await pool.query(
      'SELECT id, name, latitude, longitude, address, status, description, created_at FROM stations ORDER BY created_at DESC'
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Stations');

    sheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Tên trạm', key: 'name', width: 30 },
      { header: 'Vĩ độ', key: 'latitude', width: 15 },
      { header: 'Kinh độ', key: 'longitude', width: 15 },
      { header: 'Địa chỉ', key: 'address', width: 40 },
      { header: 'Trạng thái', key: 'status', width: 15 },
      { header: 'Mô tả', key: 'description', width: 40 },
      { header: 'Ngày tạo', key: 'created_at', width: 20 }
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667EEA' } };
    headerRow.alignment = { horizontal: 'center' };

    stations.forEach((s) => {
      sheet.addRow({
        id: s.id,
        name: s.name,
        latitude: Number(s.latitude),
        longitude: Number(s.longitude),
        address: s.address,
        status: s.status,
        description: s.description || '',
        created_at: s.created_at ? new Date(s.created_at).toLocaleString('vi-VN') : ''
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=stations.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export stations error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.exportProposals = async (req, res) => {
  try {
    const [proposals] = await pool.query(`
      SELECT p.id, p.latitude, p.longitude, p.owner_name, p.owner_phone,
             p.address, p.area, p.land_type, p.description, p.status,
             p.created_at, u.full_name as user_name, u.email as user_email
      FROM station_proposals p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Proposals');

    sheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Chủ MB', key: 'owner_name', width: 25 },
      { header: 'SĐT', key: 'owner_phone', width: 15 },
      { header: 'Địa chỉ', key: 'address', width: 40 },
      { header: 'Vĩ độ', key: 'latitude', width: 15 },
      { header: 'Kinh độ', key: 'longitude', width: 15 },
      { header: 'Diện tích', key: 'area', width: 12 },
      { header: 'Loại mặt bằng', key: 'land_type', width: 20 },
      { header: 'Ghi chú', key: 'description', width: 40 },
      { header: 'Trạng thái', key: 'status', width: 15 },
      { header: 'Người đề xuất', key: 'user_name', width: 25 },
      { header: 'Email', key: 'user_email', width: 25 },
      { header: 'Ngày tạo', key: 'created_at', width: 20 }
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667EEA' } };
    headerRow.alignment = { horizontal: 'center' };

    proposals.forEach((p) => {
      sheet.addRow({
        id: p.id,
        owner_name: p.owner_name,
        owner_phone: p.owner_phone,
        address: p.address,
        latitude: Number(p.latitude),
        longitude: Number(p.longitude),
        area: p.area || '',
        land_type: p.land_type || '',
        description: p.description || '',
        status: p.status,
        user_name: p.user_name,
        user_email: p.user_email,
        created_at: p.created_at ? new Date(p.created_at).toLocaleString('vi-VN') : ''
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=proposals.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export proposals error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getTemplate = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Import Stations');

    sheet.columns = [
      { header: 'name', key: 'name', width: 30 },
      { header: 'latitude', key: 'latitude', width: 15 },
      { header: 'longitude', key: 'longitude', width: 15 },
      { header: 'address', key: 'address', width: 40 },
      { header: 'status', key: 'status', width: 15 },
      { header: 'description', key: 'description', width: 40 }
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667EEA' } };
    headerRow.alignment = { horizontal: 'center' };

    sheet.addRow({
      name: 'Trạm A',
      latitude: 10.762622,
      longitude: 106.660172,
      address: 'Quận 1, TP.HCM',
      status: 'ACTIVE',
      description: 'Mô tả trạm'
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=station_import_template.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Download template error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.importPreview = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn file Excel' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];

    if (!sheet || sheet.rowCount < 2) {
      return res.status(400).json({ success: false, message: 'File Excel trống hoặc không có dữ liệu' });
    }

    const headers = [];
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = String(cell.value || '').trim().toLowerCase();
    });

    const requiredHeaders = ['name', 'latitude', 'longitude', 'address'];
    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
    if (missingHeaders.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Thiếu cột bắt buộc: ${missingHeaders.join(', ')}`
      });
    }

    const results = [];
    const errors = [];

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const cellValues = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cellValues[colNumber] = cell.value;
      });
      if (cellValues.length === 0 || cellValues.every((v) => !v)) continue;

      const rowData = {};
      headers.forEach((header, colNumber) => {
        if (header) {
          const cell = row.getCell(colNumber);
          rowData[header] = cell.value != null ? String(cell.value).trim() : '';
        }
      });

      const rowNum = i;
      const rowErrors = [];

      if (!rowData.name) rowErrors.push('Thiếu tên trạm');

      const lat = parseFloat(rowData.latitude);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        rowErrors.push('Vĩ độ không hợp lệ (phải từ -90 đến 90)');
      }

      const lng = parseFloat(rowData.longitude);
      if (isNaN(lng) || lng < -180 || lng > 180) {
        rowErrors.push('Kinh độ không hợp lệ (phải từ -180 đến 180)');
      }

      if (!rowData.address) rowErrors.push('Thiếu địa chỉ');

      if (rowData.status && !VALID_STATION_STATUSES.includes(rowData.status.toUpperCase())) {
        rowErrors.push(`Trạng thái không hợp lệ: "${rowData.status}". Chỉ chấp nhận: ${VALID_STATION_STATUSES.join(', ')}`);
      }

      if (rowErrors.length > 0) {
        errors.push({ row: rowNum, errors: rowErrors, data: rowData });
      } else {
        results.push({
          row: rowNum,
          name: rowData.name,
          latitude: lat,
          longitude: lng,
          address: rowData.address,
          status: rowData.status ? rowData.status.toUpperCase() : 'ACTIVE',
          description: rowData.description || ''
        });
      }
    }

    res.json({
      success: true,
      data: {
        totalRows: results.length + errors.length,
        validRows: results.length,
        errorRows: errors.length,
        rows: results,
        errors: errors
      }
    });
  } catch (error) {
    console.error('Preview import error:', error);
    res.status(500).json({ success: false, message: 'Lỗi đọc file Excel. Vui lòng kiểm tra lại định dạng file.' });
  }
};

exports.importConfirm = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { rows } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có dữ liệu để import' });
    }

    await connection.beginTransaction();

    let imported = 0;
    let failed = 0;
    const failDetails = [];

    for (const row of rows) {
      try {
        await connection.query(
          'INSERT INTO stations (name, latitude, longitude, address, status, description) VALUES (?, ?, ?, ?, ?, ?)',
          [row.name, row.latitude, row.longitude, row.address, row.status || 'ACTIVE', row.description || '']
        );
        imported++;
      } catch (err) {
        failed++;
        failDetails.push({ row: row.row || '?', error: err.message });
      }
    }

    if (failed > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Import thất bại: ${failed} dòng lỗi. Tất cả đã được hoàn tác.`,
        data: { imported: 0, failed, failDetails }
      });
    }

    await connection.commit();

    res.json({
      success: true,
      data: { imported, failed, failDetails },
      message: `Import thành công: ${imported} trạm`
    });
  } catch (error) {
    await connection.rollback();
    console.error('Confirm import error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  } finally {
    connection.release();
  }
};
