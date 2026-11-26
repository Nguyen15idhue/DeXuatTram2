const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const sheetImport = require('../src/services/historicalOnImport/historicalOnImportSheet');

const workbookWithRow = async (values = {}) => {
  const workbook = await sheetImport.createTemplate([{ id: 1, name: 'DC 60kW' }]);
  const sheet = workbook.worksheets[0];
  const headers = sheet.getRow(1).values;
  for (const [label, value] of Object.entries(values)) {
    const column = headers.indexOf(label);
    assert.notEqual(column, -1, label);
    sheet.getCell(2, column).value = value;
  }
  const copy = new ExcelJS.Workbook();
  await copy.xlsx.load(await workbook.xlsx.writeBuffer());
  return copy;
};

test('template has a single sheet and supports partial deployment without assuming acceptance', async () => {
  const workbook = await workbookWithRow({
    'Mã BCĐX': '01-0326',
    'Mô hình đầu tư': 'NQ',
    'Trụ 1 - Mô hình': 'NQ',
    'Trụ 1 - Loại trụ': 'AC 22kW',
    'Trụ 1 - SL đề xuất': 10,
    'Trụ 1 - SL chốt': 10,
    'Trụ 1 - SL đã giao': 4,
    'Trụ 1 - SL đã nhận': 4,
    'Trụ 1 - SL đã lắp': 4,
    'Trụ 1 - SL đã ON': 2
  });
  assert.equal(workbook.worksheets.length, 1);
  const [record] = sheetImport.readSheet(workbook);
  assert.equal(record.poles[0].committed, 10);
  assert.equal(record.poles[0].shipped, 4);
  assert.equal(record.poles[0].on, 2);
  assert.equal(record.poles[0].accepted, null);
  assert.equal(record.poles[0].supplier, null);
});

test('acceptance and ON overlap is required instead of guessing', async () => {
  const base = {
    'Trụ 1 - Mô hình': 'LK', 'Trụ 1 - Loại trụ': 'DC 60kW',
    'Trụ 1 - SL chốt': 4, 'Trụ 1 - SL đã giao': 4, 'Trụ 1 - SL đã nhận': 4,
    'Trụ 1 - SL đã lắp': 4, 'Trụ 1 - SL nghiệm thu đạt': 2, 'Trụ 1 - SL đã ON': 2
  };
  const missing = await workbookWithRow(base);
  assert.throws(() => sheetImport.readSheet(missing), /cần số lượng vừa nghiệm thu đạt vừa ON/);
  const impossible = await workbookWithRow({ ...base, 'Trụ 1 - SL vừa nghiệm thu đạt vừa ON': 3 });
  assert.throws(() => sheetImport.readSheet(impossible), /số trụ vừa nghiệm thu đạt vừa ON không hợp lệ/);
  const valid = await workbookWithRow({ ...base, 'Trụ 1 - SL vừa nghiệm thu đạt vừa ON': 1 });
  assert.equal(sheetImport.readSheet(valid)[0].poles[0].accepted_on, 1);
});

test('rejects quantities exceeding committed and installed quantities', async () => {
  const workbook = await workbookWithRow({
    'Trụ 1 - Mô hình': 'TDT', 'Trụ 1 - Loại trụ': 'DC 60kW',
    'Trụ 1 - SL chốt': 3, 'Trụ 1 - SL đã giao': 4
  });
  assert.throws(() => sheetImport.readSheet(workbook), /số lượng trụ 1 không phù hợp/);
});

test('rejects inconsistent known counts even when intermediate cells are blank', async () => {
  const workbook = await workbookWithRow({
    'Trụ 1 - Mô hình': 'TDT', 'Trụ 1 - Loại trụ': 'DC 60kW',
    'Trụ 1 - SL chốt': 3, 'Trụ 1 - SL đã lắp': 4
  });
  assert.throws(() => sheetImport.readSheet(workbook), /số lượng trụ 1 không phù hợp/);
});

test('rejects unexpected sheets and formulas', async () => {
  const workbook = await workbookWithRow({ 'Mã BCĐX': '01-0326' });
  workbook.addWorksheet('extra');
  assert.throws(() => sheetImport.readSheet(workbook), /một sheet/);
  const formula = await workbookWithRow({ 'Mã BCĐX': { formula: '1+1', result: 2 } });
  assert.throws(() => sheetImport.readSheet(formula), /không nhận công thức/);
});
