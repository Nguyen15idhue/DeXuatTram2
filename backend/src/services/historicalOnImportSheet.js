const ExcelJS = require('exceljs');

const SHEET_NAME = 'Import tram cu';
const FIELDS = [
  ['legacy_code', 'Mã BCĐX'],
  ['cms_code', 'Mã trạm CMS'],
  ['existing_proposal_id', 'ID đề xuất cần cập nhật'],
  ['owner_name', 'Tên chủ đầu tư'],
  ['owner_phone', 'Số điện thoại liên hệ'],
  ['address', 'Địa chỉ'],
  ['province', 'Tỉnh thành'],
  ['ward', 'Xã phường'],
  ['latitude', 'Vĩ độ'],
  ['longitude', 'Kinh độ'],
  ['map_url', 'Link Google Maps'],
  ['owner_name_system', 'Tên người đề xuất trong hệ thống'],
  ['owner_user_id', 'ID người đề xuất cần chọn'],
  ['model', 'Mô hình đầu tư'],
  ['proposal_status', 'Trạng thái đề xuất'],
  ['on_status', 'Trạng thái ON trạm'],
  ['contract_status', 'Trạng thái hợp đồng'],
  ['contract_number', 'Số hợp đồng'],
  ['contract_date', 'Ngày ký hợp đồng'],
  ['contract_amount', 'Giá trị hợp đồng'],
  ['power_status', 'Trạng thái hạ tầng điện'],
  ['site_status', 'Trạng thái hạ tầng mặt bằng'],
  ['deposit_status', 'Trạng thái cọc'],
  ['payment_status', 'Trạng thái thanh toán'],
  ['delivery_status', 'Trạng thái giao trụ'],
  ['delivery_date', 'Ngày giao trụ'],
  ['on_date', 'Ngày ON đầu tiên'],
  ['cancel_kind', 'Loại hủy'],
  ['note', 'Ghi chú']
];

const POLE_FIELDS = [
  ['model', 'Mô hình'],
  ['name', 'Loại trụ'],
  ['supplier', 'Nhà cung cấp'],
  ['proposed', 'SL đề xuất'],
  ['committed', 'SL chốt'],
  ['shipped', 'SL đã giao'],
  ['received', 'SL đã nhận'],
  ['installed', 'SL đã lắp'],
  ['accepted', 'SL nghiệm thu đạt'],
  ['on', 'SL đã ON'],
  ['accepted_on', 'SL vừa nghiệm thu đạt vừa ON']
];

const CHOICES = {
  model: ['TDT', 'NQ', 'LK', 'NQ_LK'],
  proposal_status: ['Đã duyệt BCĐX', 'Đang triển khai', 'Hoạt động', 'Đã hủy', 'Đã lưu trữ'],
  on_status: ['Hợp đồng và hạ tầng', 'Giao trụ', 'Lắp trụ', 'Nghiệm thu', 'Cấu hình', 'Hoạt động', 'Đã hủy'],
  contract_status: ['Chưa thực hiện', 'Đang thực hiện', 'Hoàn thành', 'Đã hủy'],
  power_status: ['Chưa thực hiện', 'Đang thực hiện', 'Hoàn thành'],
  site_status: ['Chưa thực hiện', 'Đang thực hiện', 'Hoàn thành'],
  deposit_status: ['Chưa nhận', 'Đã nhận', 'Chờ hoàn', 'Đã hoàn', 'Không áp dụng'],
  payment_status: ['Chưa thực hiện', 'Đang thực hiện', 'Hoàn thành', 'Không áp dụng'],
  delivery_status: ['Chưa giao', 'Đang giao', 'Đã giao', 'Giao thất bại'],
  cancel_kind: ['Hủy ON trạm', 'Hủy BCĐX']
};
const INTEGER_FIELDS = new Set(POLE_FIELDS.slice(3).map(([key]) => key));
const fail = message => Object.assign(new Error(message), { statusCode: 400 });
const empty = value => value === undefined || value === null || value === '';
const text = value => String(value ?? '').trim();

const poleHeader = (index, label) => `Trụ ${index} - ${label}`;

const createTemplate = async (catalog) => {
  if (!Array.isArray(catalog) || !catalog.length) throw fail('Danh mục loại trụ đang trống');
  const count = catalog.length * 3;
  if (FIELDS.length + count * POLE_FIELDS.length > 16384) throw fail('Danh mục loại trụ vượt giới hạn cột Excel');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);
  const headings = FIELDS.map(([, label]) => label);
  for (let i = 1; i <= count; i++) {
    headings.push(...POLE_FIELDS.map(([, label]) => poleHeader(i, label)));
  }
  sheet.addRow(headings);
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }];
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(headings.length).letter}1` };
  headings.forEach((label, index) => {
    const column = sheet.getColumn(index + 1);
    column.width = Math.max(18, Math.min(34, label.length + 3));
    column.numFmt = '@';
    const header = sheet.getCell(1, index + 1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index < FIELDS.length ? 'FF1E3A5F' : 'FF13796B' } };
    header.note = 'Mỗi dòng là một đề xuất/ON. Ô trống khi cập nhật giữ dữ liệu hiện có.';
  });
  FIELDS.forEach(([key], index) => {
    if (!CHOICES[key]) return;
    for (let row = 2; row <= 501; row++) {
      sheet.getCell(row, index + 1).dataValidation = {
        type: 'list', allowBlank: true, showErrorMessage: true,
        formulae: [`"${CHOICES[key].join(',')}"`]
      };
    }
  });
  return workbook;
};

const cellValue = (cell, row, label) => {
  const value = cell.value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value !== null && typeof value === 'object') throw fail(`Dòng ${row}: ${label} không nhận công thức hoặc ô phức hợp`);
  return typeof value === 'string' ? value.trim() : value;
};

const quantity = (value, row, label) => {
  if (empty(value)) return null;
  if (!/^\d+$/.test(text(value))) throw fail(`Dòng ${row}: ${label} phải là số nguyên không âm`);
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw fail(`Dòng ${row}: ${label} vượt giới hạn`);
  return result;
};

const readSheet = (workbook) => {
  if (workbook.worksheets.length !== 1 || workbook.worksheets[0].name !== SHEET_NAME) {
    throw fail('File không đúng mẫu một sheet; hãy tải mẫu import trạm cũ');
  }
  const sheet = workbook.worksheets[0];
  if (sheet.rowCount > 501) throw fail('Tối đa 500 dòng dữ liệu');
  const headings = new Map();
  sheet.getRow(1).eachCell((cell, index) => {
    const label = text(cell.value);
    if (headings.has(label)) throw fail(`Tiêu đề bị lặp: ${label}`);
    headings.set(label, index);
  });
  for (const [, label] of FIELDS) {
    if (!headings.has(label)) throw fail(`Thiếu cột: ${label}`);
  }
  const groups = new Map();
  for (const [label, column] of headings) {
    if (FIELDS.some(([, name]) => name === label)) continue;
    const match = /^Trụ ([1-9]\d*) - (.+)$/.exec(label);
    const field = match && POLE_FIELDS.find(([, name]) => name === match[2]);
    if (!field) throw fail(`Cột không thuộc mẫu: ${label}`);
    const index = Number(match[1]);
    if (!groups.has(index)) groups.set(index, new Map());
    groups.get(index).set(field[0], column);
  }
  if (!groups.size) throw fail('Thiếu các cột thông tin trụ');
  for (const [index, fields] of groups) {
    if (fields.size !== POLE_FIELDS.length) throw fail(`Thiếu cột trong nhóm Trụ ${index}`);
  }
  const result = [];
  sheet.eachRow((row, number) => {
    if (number === 1 || !row.hasValues) return;
    const record = { row: number, poles: [] };
    const headerColumns = new Set(headings.values());
    row.eachCell((cell, index) => {
      if (!headerColumns.has(index) && !empty(cell.value)) {
        throw fail(`Dòng ${number}: có dữ liệu ngoài các cột của mẫu`);
      }
    });
    for (const [key, label] of FIELDS) record[key] = cellValue(row.getCell(headings.get(label)), number, label);
    for (const [key, choices] of Object.entries(CHOICES)) {
      if (!empty(record[key]) && !choices.includes(text(record[key]))) {
        throw fail(`Dòng ${number}: ${FIELDS.find(([name]) => name === key)[1]} không hợp lệ`);
      }
    }
    for (const [index, columns] of groups) {
      const values = {};
      for (const [key, label] of POLE_FIELDS) values[key] = cellValue(row.getCell(columns.get(key)), number, poleHeader(index, label));
      if (Object.values(values).every(empty)) continue;
      if (!text(values.name)) throw fail(`Dòng ${number}: Trụ ${index} thiếu loại trụ`);
      if (!['NQ', 'LK', 'TDT'].includes(text(values.model))) throw fail(`Dòng ${number}: Trụ ${index} thiếu mô hình NQ, LK hoặc TDT`);
      for (const key of INTEGER_FIELDS) values[key] = quantity(values[key], number, poleHeader(index, POLE_FIELDS.find(([name]) => name === key)[1]));
      const exceeds = (left, right) => left !== null && right !== null && left > right;
      const ordered = ['committed', 'shipped', 'received', 'installed'];
      if (ordered.some((key, index) => ordered.slice(index + 1).some(later => exceeds(values[later], values[key])))
        || ['accepted', 'on'].some(key => ordered.some(upper => exceeds(values[key], values[upper])))) {
        throw fail(`Dòng ${number}: số lượng trụ ${index} không phù hợp với tiến độ`);
      }
      if ((values.accepted_on !== null && (exceeds(values.accepted_on, values.accepted) || exceeds(values.accepted_on, values.on)))
        || (values.accepted_on !== null && values.accepted !== null && values.on !== null && values.installed !== null
          && values.accepted_on < values.accepted + values.on - values.installed)) {
        throw fail(`Dòng ${number}: số trụ vừa nghiệm thu đạt vừa ON không hợp lệ`);
      }
      if (values.accepted > 0 && values.on > 0 && values.accepted_on === null) {
        throw fail(`Dòng ${number}: Trụ ${index} cần số lượng vừa nghiệm thu đạt vừa ON`);
      }
      values.supplier = text(values.supplier) || null;
      record.poles.push(values);
    }
    result.push(record);
  });
  if (!result.length) throw fail('Sheet import chưa có dữ liệu');
  return result;
};

module.exports = { SHEET_NAME, FIELDS, POLE_FIELDS, CHOICES, createTemplate, readSheet };
