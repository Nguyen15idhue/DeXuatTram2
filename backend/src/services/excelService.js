const ExcelJS = require('exceljs');
const multer = require('multer');
const pool = require('../utils/db');
const fieldDefinitionService = require('./fieldDefinitionService');
const dataListService = require('./dataListService');
const proximityService = require('./proximityService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

exports.uploadMiddleware = upload.single('file');

const ENTITY_TABLE_MAP = {
  stations: 'stations',
  users: 'users',
  station_proposals: 'station_proposals'
};

const VALID_STATUSES = {
  stations: ['ACTIVE', 'DEPLOYING'],
  users: ['ACTIVE', 'LOCKED'],
  station_proposals: ['PENDING', 'REVIEWING', 'APPROVED', 'REJECTED']
};

const HEADER_STYLE = {
  font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667EEA' } },
  alignment: { horizontal: 'center', vertical: 'middle' },
  border: {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' }
  }
};

async function buildExportColumns(entity, viewId) {
  const viewFieldsResult = await pool.query(
    `SELECT vf.order_index, fd.\`key\`, fd.label, fd.type, fd.source_type
     FROM view_fields vf
     JOIN field_definitions fd ON vf.field_id = fd.id
     WHERE vf.view_id = ? AND vf.visible = 1 AND fd.status = 'active'
     ORDER BY vf.order_index`,
    [viewId]
  );
  const viewFields = viewFieldsResult[0];

  const allFieldsResult = await pool.query(
    `SELECT \`key\`, label, type, source_type FROM field_definitions WHERE entity = ? AND status = 'active'`,
    [entity]
  );
  const allFields = allFieldsResult[0];

  const viewKeys = new Set(viewFields.map(f => f.key));
  const remainingFields = allFields.filter(f => !viewKeys.has(f.key));

  const columns = [
    { key: '_stt', label: 'STT', type: 'number', source_type: 'system' }
  ];

  viewFields.forEach(f => {
    columns.push({ key: f.key, label: f.label, type: f.type, source_type: f.source_type });
  });

  remainingFields.forEach(f => {
    columns.push({ key: f.key, label: f.label, type: f.type, source_type: f.source_type });
  });

  return columns;
}

function buildImportColumns(entity, fieldDefs) {
  const columns = [
    { key: '_stt', label: 'STT', type: 'number', source_type: 'system', required: false }
  ];

  fieldDefs.forEach(f => {
    let formulaConfig = null;
    if (f.formula_config) {
      try { formulaConfig = typeof f.formula_config === 'string' ? JSON.parse(f.formula_config) : f.formula_config; } catch { formulaConfig = null; }
    }
    columns.push({
      key: f.key,
      label: f.label,
      type: f.type,
      source_type: f.source_type,
      required: !!f.required,
      computeMode: formulaConfig ? (formulaConfig.compute_mode || 'pre') : null
    });
  });

  return columns;
}

function getAllData(entity) {
  const table = ENTITY_TABLE_MAP[entity];
  if (!table) throw new Error(`Entity không hợp lệ: ${entity}`);
  return pool.query(`SELECT * FROM ${table} ORDER BY id DESC`);
}

function styleHeaderRow(sheet) {
  const headerRow = sheet.getRow(1);
  headerRow.height = 25;
  headerRow.eachCell((cell) => {
    cell.font = HEADER_STYLE.font;
    cell.fill = HEADER_STYLE.fill;
    cell.alignment = HEADER_STYLE.alignment;
    cell.border = HEADER_STYLE.border;
  });
}

function autoWidthColumns(sheet, columns) {
  columns.forEach((col, idx) => {
    const colNum = idx + 1;
    let maxWidth = col.label.length + 4;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const cell = row.getCell(colNum);
      const val = cell.value != null ? String(cell.value) : '';
      if (val.length > maxWidth) maxWidth = val.length;
    });
    sheet.getColumn(colNum).width = Math.min(maxWidth + 2, 50);
  });
}

function getSampleValue(col) {
  if (col.type === 'formula' && col.computeMode === 'post') return '';
  switch (col.type) {
    case 'number': return 0;
    case 'email': return 'example@email.com';
    case 'phone': return '0901234567';
    case 'date': return '01/01/2026';
    case 'datetime': return '01/01/2026 12:00';
    case 'boolean': return 'true';
    case 'select': return 'option1';
    case 'multiselect': return 'option1,option2';
    case 'file': return '(file upload - không import được)';
    default: return '';
  }
}

function validateHeaders(headerRow, columns, skipFirst = true) {
  const errors = [];
  const headerLabels = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headerLabels[colNumber] = String(cell.value || '').trim();
  });

  const startIdx = skipFirst ? 1 : 0;
  for (let i = startIdx; i < columns.length; i++) {
    const expected = columns[i].label;
    const expectedLower = expected.toLowerCase();
    const found = headerLabels.some((h, idx) => idx > 0 && h && h.toLowerCase() === expectedLower);
    if (!found) {
      errors.push(`Thiếu cột: "${expected}"`);
    }
  }

  return errors;
}

function buildHeaderMap(headerRow, columns) {
  const map = {};
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const label = String(cell.value == null ? '' : cell.value).trim().toLowerCase();
    if (!label) return;
    const matched = columns.find(c => c.key !== '_stt' && c.label.toLowerCase() === label);
    if (matched) map[colNumber] = matched.key;
  });
  return map;
}

function parseExcelRow(row, columns, entity, headerMap) {
  const fixedData = {};
  const dynamicData = {};
  const errors = [];

  const byKey = {};
  columns.forEach(c => { byKey[c.key] = c; });
  const valueByKey = {};
  if (headerMap) {
    Object.entries(headerMap).forEach(([colNumber, key]) => {
      const cell = row.getCell(Number(colNumber));
      valueByKey[key] = cell ? cell.value : '';
    });
  }

  columns.forEach(col => {
    if (col.key === '_stt') return;
    if (col.type === 'file') return;
    if (col.type === 'formula' && col.computeMode === 'post') return;

    let value = Object.prototype.hasOwnProperty.call(valueByKey, col.key) ? valueByKey[col.key] : '';

    if (value && typeof value === 'object' && value.result !== undefined) {
      value = value.result;
    }

    if (value == null || value === '') {
      value = '';
    } else if (typeof value === 'number') {
      value = value;
    } else if (value instanceof Date) {
      value = value.toISOString().split('T')[0];
    } else {
      value = String(value).trim();
    }

    if (value === '' && col.required) {
      if (entity === 'station_proposals' && (col.key === 'ma_tinh' || col.key === 'vung_mien') && dynamicData.province) {
        return;
      }
      errors.push(`${col.label} là bắt buộc`);
      return;
    }

    if (col.source_type === 'fixed') {
      if (col.key === 'latitude' || col.key === 'longitude') {
        const num = parseFloat(value);
        if (value !== '' && (isNaN(num) || (col.key === 'latitude' && (num < -90 || num > 90)) || (col.key === 'longitude' && (num < -180 || num > 180)))) {
          errors.push(`${col.label}: giá trị không hợp lệ (${value})`);
        } else {
          fixedData[col.key] = num || 0;
        }
      } else if (col.type === 'number') {
        const num = parseFloat(value);
        if (value !== '' && isNaN(num)) {
          errors.push(`${col.label}: phải là số (${value})`);
        } else {
          fixedData[col.key] = num || 0;
        }
      } else if (col.type === 'boolean') {
        fixedData[col.key] = value === 'true' || value === '1' || value === 'TRUE' ? 1 : 0;
      } else if (col.type === 'select' && entity && VALID_STATUSES[entity] && col.key === 'status') {
        const upper = String(value).toUpperCase();
        if (value !== '' && !VALID_STATUSES[entity].includes(upper)) {
          errors.push(`${col.label}: trạng thái không hợp lệ "${value}". Chấp nhận: ${VALID_STATUSES[entity].join(', ')}`);
        } else {
          fixedData[col.key] = upper || VALID_STATUSES[entity][0];
        }
      } else {
        fixedData[col.key] = value;
      }
    } else {
      if (col.type === 'number' && value !== '') {
        const num = parseFloat(value);
        if (isNaN(num)) {
          errors.push(`${col.label}: phải là số (${value})`);
        } else {
          dynamicData[col.key] = num;
        }
      } else if (col.type === 'boolean') {
        dynamicData[col.key] = value === 'true' || value === '1' || value === 'TRUE';
      } else {
        dynamicData[col.key] = value;
      }
    }
  });

  return { fixedData, dynamicData, errors };
}

exports.exportDynamic = async (req, res) => {
  try {
    const { entity } = req.query;
    const viewIdMap = { stations: 6, users: 7, station_proposals: 8 };
    const viewId = viewIdMap[entity];

    if (!viewId) {
      return res.status(400).json({ success: false, message: 'Entity không hợp lệ. Chọn: stations, users, station_proposals' });
    }

    const columns = await buildExportColumns(entity, viewId);
    const [rows] = await getAllData(entity);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(entity);

    sheet.addRow(columns.map(c => c.label));
    styleHeaderRow(sheet);

    rows.forEach((row, idx) => {
      const values = columns.map(col => {
        if (col.key === '_stt') return idx + 1;

        let value;
        if (col.source_type === 'fixed') {
          value = row[col.key];
        } else {
          const custom = row.custom_data ? (typeof row.custom_data === 'string' ? JSON.parse(row.custom_data) : row.custom_data) : {};
          value = custom[col.key];
        }

        if (value == null) return '';

        if (col.type === 'file') {
          const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/api\/?$/, '');
          const files = Array.isArray(value) ? value : [value];
          const fileData = files.filter(f => f && f.original_name).map(f => ({
            original_name: f.original_name,
            link: f.storage_key ? `${baseUrl}/uploads/${f.storage_key}` : null
          }));
          if (fileData.length === 0) return '';
          if (fileData.length === 1) return JSON.stringify(fileData[0]);
          return JSON.stringify(fileData);
        }

        if (typeof value === 'object' && value.result !== undefined) {
          value = value.result;
        }

        return value;
      });
      sheet.addRow(values);
    });

    autoWidthColumns(sheet, columns);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${entity}_export.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export dynamic error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.importPreviewDynamic = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn file Excel' });
    }

    const { entity } = req.query;
    if (!entity || !ENTITY_TABLE_MAP[entity]) {
      return res.status(400).json({ success: false, message: 'Entity không hợp lệ' });
    }

    const [fieldDefs] = await pool.query(
      'SELECT `key`, label, type, source_type, required, formula_config FROM field_definitions WHERE entity = ? AND status = \'active\' ORDER BY id',
      [entity]
    );
    const columns = buildImportColumns(entity, fieldDefs);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];

    if (!sheet || sheet.rowCount < 2) {
      return res.status(400).json({ success: false, message: 'File Excel trống hoặc không có dữ liệu' });
    }

    const headerColumns = entity === 'station_proposals'
      ? columns.filter(c => c.key !== 'ma_tinh' && c.key !== 'vung_mien')
      : columns;
    const headerErrors = validateHeaders(sheet.getRow(1), headerColumns);
    if (headerErrors.length > 0) {
      return res.status(400).json({ success: false, message: `Lỗi header: ${headerErrors.join('; ')}` });
    }

    const validRows = [];
    const errors = [];
    const headerMap = buildHeaderMap(sheet.getRow(1), columns);

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const isEmpty = row.values.every((v, i) => i === 0 || v == null || v === '');
      if (isEmpty) return;

      const parsed = parseExcelRow(row, columns, entity, headerMap);

      if (parsed.errors.length > 0) {
        errors.push({ row: rowNumber, errors: parsed.errors });
      } else {
        validRows.push({
          rowNumber,
          fixedData: parsed.fixedData,
          dynamicData: parsed.dynamicData
        });
      }
    });

    if (entity === 'station_proposals') {
      const kept = [];
      for (const vr of validRows) {
        const lat = parseFloat(vr.fixedData.latitude);
        const lng = parseFloat(vr.fixedData.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          try {
            const nearby = await proximityService.checkNearby(lat, lng, 200);
            if (nearby.is_duplicate) {
              const n = nearby.nearest;
              const who = n.kind === 'station' ? 'trạm' : 'đề xuất';
              errors.push({ row: vr.rowNumber, errors: [`Vị trí trùng với ${who} #${n.id} (cách ${n.distance_m}m < 200m), không cho import`] });
              continue;
            }
          } catch { /* silent */ }
        }
        kept.push(vr);
      }
      validRows.length = 0;
      validRows.push(...kept);
    }

    res.json({
      success: true,
      data: {
        columns: columns.map(c => ({ key: c.key, label: c.label, type: c.type })),
        totalRows: validRows.length + errors.length,
        validRows: validRows.length,
        errorRows: errors.length,
        rows: validRows,
        errors
      }
    });
  } catch (error) {
    console.error('Import preview dynamic error:', error);
    res.status(500).json({ success: false, message: 'Lỗi đọc file Excel. Vui lòng kiểm tra lại định dạng file.' });
  }
};

exports.importConfirmDynamic = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { entity, rows } = req.body;

    if (!entity || !ENTITY_TABLE_MAP[entity]) {
      return res.status(400).json({ success: false, message: 'Entity không hợp lệ' });
    }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có dữ liệu để import' });
    }

    const table = ENTITY_TABLE_MAP[entity];
    await connection.beginTransaction();

    const dynamicEngineService = require('./dynamicEngineService');
    const [allDefs] = await connection.query(
      'SELECT `key`, formula_config FROM field_definitions WHERE entity = ? AND status = \'active\'',
      [entity]
    );
    const postFormulaKeys = new Set(
      allDefs.filter(f => {
        if (!f.formula_config) return false;
        try {
          const fc = typeof f.formula_config === 'string' ? JSON.parse(f.formula_config) : f.formula_config;
          return fc.compute_mode === 'post';
        } catch { return false; }
      }).map(f => f.key)
    );

    let imported = 0;
    let failed = 0;
    const failDetails = [];

    for (const row of rows) {
      try {
        const fixedData = row.fixedData || {};
        const dynamicData = row.dynamicData || {};
        postFormulaKeys.forEach(k => { delete dynamicData[k]; });

        if (entity === 'station_proposals') {
          await dataListService.applyDiaGioi(dynamicData);
        }

        if (entity === 'station_proposals' && req.user && req.user.id) {
          fixedData.user_id = req.user.id;
        }

        const fixedCols = Object.keys(fixedData);
        const fixedValues = Object.values(fixedData);

        if (fixedCols.length === 0) {
          failed++;
          failDetails.push({ row: row.rowNumber || '?', error: 'Không có dữ liệu cột cố định' });
          continue;
        }

        const placeholders = fixedCols.map(() => '?').join(', ');
        const [result] = await connection.query(
          `INSERT INTO ${table} (${fixedCols.join(', ')}) VALUES (${placeholders})`,
          fixedValues
        );

        const postResults = await dynamicEngineService.computePostFormulas(entity, result.insertId, dynamicData, req.user ? req.user.id : null, null, { connection });
        const mergedDynamic = { ...dynamicData, ...postResults };
        if (Object.keys(mergedDynamic).length > 0) {
          await connection.query(
            `UPDATE ${table} SET custom_data = ? WHERE id = ?`,
            [JSON.stringify(mergedDynamic), result.insertId]
          );
        }

        imported++;
      } catch (err) {
        failed++;
        failDetails.push({ row: row.rowNumber || '?', error: err.message });
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
      data: { imported, failed: 0, failDetails: [] },
      message: `Import thành công: ${imported} bản ghi`
    });
  } catch (error) {
    await connection.rollback();
    console.error('Import confirm dynamic error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  } finally {
    connection.release();
  }
};

exports.getTemplateDynamic = async (req, res) => {
  try {
    const { entity } = req.query;
    if (!entity || !ENTITY_TABLE_MAP[entity]) {
      return res.status(400).json({ success: false, message: 'Entity không hợp lệ' });
    }

    const [fieldDefs] = await pool.query(
      'SELECT `key`, label, type, source_type, required, formula_config FROM field_definitions WHERE entity = ? AND status = \'active\' ORDER BY id',
      [entity]
    );
    const columns = buildImportColumns(entity, fieldDefs);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(entity);

    sheet.addRow(columns.map(c => c.label));
    styleHeaderRow(sheet);

    const sampleRow = sheet.addRow(columns.map(c => getSampleValue(c)));
    columns.forEach((c, idx) => {
      if (c.type === 'formula' && c.computeMode === 'post') {
        sampleRow.getCell(idx + 1).note = 'Bỏ trống - hệ thống tự sinh sau khi lưu';
      }
      if (entity === 'station_proposals' && (c.key === 'ma_tinh' || c.key === 'vung_mien')) {
        sampleRow.getCell(idx + 1).note = 'Bỏ trống - hệ thống tự suy từ Tỉnh thành';
      }
    });

    autoWidthColumns(sheet, columns);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${entity}_template.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Get template dynamic error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.exportStations = async (req, res) => {
  req.query = { entity: 'stations' };
  return exports.exportDynamic(req, res);
};

exports.exportProposals = async (req, res) => {
  req.query = { entity: 'station_proposals' };
  return exports.exportDynamic(req, res);
};

exports.exportUsers = async (req, res) => {
  req.query = { entity: 'users' };
  return exports.exportDynamic(req, res);
};

exports.getTemplate = async (req, res) => {
  if (!req.query.entity) req.query.entity = 'stations';
  return exports.getTemplateDynamic(req, res);
};

exports.importPreview = async (req, res) => {
  if (!req.query.entity) req.query.entity = 'stations';
  return exports.importPreviewDynamic(req, res);
};

exports.importConfirm = async (req, res) => {
  return exports.importConfirmDynamic(req, res);
};

exports.exportDataList = async (req, res) => {
  try {
    const { id } = req.params;
    const list = await dataListService.getById(id);
    if (!list) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy data list' });
    }

    const columnsConfig = Array.isArray(list.columns_config) ? list.columns_config : JSON.parse(list.columns_config || '[]');
    const columns = [
      { key: '_stt', label: 'STT', type: 'number' },
      ...columnsConfig.map(c => ({ key: c.key, label: c.label, type: c.type }))
    ];

    const rows = list.rows || [];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(list.name || 'Data List');

    sheet.addRow(columns.map(c => c.label));
    styleHeaderRow(sheet);

    rows.forEach((row, idx) => {
      const data = row.data || {};
      const values = columns.map(col => {
        if (col.key === '_stt') return idx + 1;
        return data[col.key] != null ? data[col.key] : '';
      });
      sheet.addRow(values);
    });

    autoWidthColumns(sheet, columns);

    const safeName = (list.name || 'data_list').replace(/[^a-zA-Z0-9_\-]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${safeName}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export data list error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.importDataListPreview = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn file Excel' });
    }

    const { id } = req.params;
    const list = await dataListService.getById(id);
    if (!list) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy data list' });
    }

    const columnsConfig = Array.isArray(list.columns_config) ? list.columns_config : JSON.parse(list.columns_config || '[]');
    const columns = [
      { key: '_stt', label: 'STT', type: 'number' },
      ...columnsConfig
    ];

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];

    if (!sheet || sheet.rowCount < 2) {
      return res.status(400).json({ success: false, message: 'File Excel trống hoặc không có dữ liệu' });
    }

    const headerErrors = validateHeaders(sheet.getRow(1), columns);
    if (headerErrors.length > 0) {
      return res.status(400).json({ success: false, message: `Lỗi header: ${headerErrors.join('; ')}` });
    }

    const validRows = [];
    const errors = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const isEmpty = row.values.every((v, i) => i === 0 || v == null || v === '');
      if (isEmpty) return;

      const rowErrors = [];
      const rowData = {};

      columns.forEach((col, idx) => {
        if (col.key === '_stt') return;

        let value = '';

        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const cellLabel = String(cell.value || '').trim().toLowerCase();
          if (col.label.toLowerCase() === cellLabel) {
            let raw = cell.value;
            if (raw && typeof raw === 'object' && raw.result !== undefined) raw = raw.result;
            if (raw == null || raw === '') value = '';
            else if (typeof raw === 'number') value = raw;
            else if (raw instanceof Date) value = raw.toISOString().split('T')[0];
            else value = String(raw).trim();
          }
        });

        if (col.type === 'number' && value !== '') {
          const num = parseFloat(value);
          if (isNaN(num)) {
            rowErrors.push(`${col.label}: phải là số (${value})`);
          } else {
            rowData[col.key] = num;
          }
        } else {
          rowData[col.key] = value;
        }
      });

      if (rowErrors.length > 0) {
        errors.push({ row: rowNumber, errors: rowErrors });
      } else {
        validRows.push({ rowNumber, data: rowData });
      }
    });

    res.json({
      success: true,
      data: {
        columns: columns.map(c => ({ key: c.key, label: c.label, type: c.type })),
        totalRows: validRows.length + errors.length,
        validRows: validRows.length,
        errorRows: errors.length,
        rows: validRows,
        errors
      }
    });
  } catch (error) {
    console.error('Import data list preview error:', error);
    res.status(500).json({ success: false, message: 'Lỗi đọc file Excel' });
  }
};

exports.importDataListConfirm = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có dữ liệu để import' });
    }

    const list = await dataListService.getById(id);
    if (!list) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy data list' });
    }

    const insertRows = rows.map((row, idx) => ({
      data: row.data || {},
      sort_order: idx
    }));

    await dataListService.addRows(id, insertRows);

    res.json({
      success: true,
      data: { imported: rows.length },
      message: `Import thành công: ${rows.length} dòng`
    });
  } catch (error) {
    console.error('Import data list confirm error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
