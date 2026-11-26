const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { inspectRows, preview } = require('../src/services/historicalOnImport/historicalOnImportPreview');
const { createTemplate, FIELDS, POLE_FIELDS } = require('../src/services/historicalOnImport/historicalOnImportSheet');

const catalog = {
  poles: [{ id: 1, name: 'AC 22kW' }],
  suppliers: [{ id: 1, name: 'Meter' }]
};
const accounts = [
  { id: 1, full_name: 'Người nhập', status: 'ACTIVE', role: 'SUPER_ADMIN' },
  { id: 2, full_name: 'Người bán', status: 'ACTIVE', role: 'SALES' }
];
const context = { candidates: [], accounts, catalog, importer: accounts[0] };
const baseRow = {
  row: 2, legacy_code: 'OLD-1', cms_code: 'CMS-1', owner_name: 'Khách hàng',
  owner_phone: '0123456789', address: 'Địa chỉ', province: 'Hà Nội', latitude: 21,
  longitude: 105, model: 'NQ', owner_name_system: 'Người bán',
  poles: [{ model: 'NQ', name: 'AC 22kW', proposed: 2, committed: 2 }]
};

test('preliminary preview identifies a new proposal and detects duplicate file identities', () => {
  const rows = inspectRows([baseRow, { ...baseRow, row: 3 }], context);
  assert.equal(rows[0].action, 'create');
  assert.equal(rows[0].owner.id, 2);
  assert.deepEqual(rows[0].errors, []);
  assert.match(rows[1].errors.join(' '), /trùng dòng 2/);
});

test('preliminary preview asks for ambiguous records and rejects unknown catalog items', () => {
  const candidates = [
    { id: 10, legacy_code: 'OLD-1', cms_code: 'A' },
    { id: 11, legacy_code: 'OLD-1', cms_code: 'B' }
  ];
  const [ambiguous] = inspectRows([{ ...baseRow, cms_code: '' }], { ...context, candidates });
  assert.equal(ambiguous.action, 'choose');
  assert.deepEqual(ambiguous.candidates.map(item => item.id), [10, 11]);
  assert.match(ambiguous.errors.join(' '), /nhập ID đề xuất/);
  const [badPole] = inspectRows([{ ...baseRow, poles: [{ ...baseRow.poles[0], name: 'Không có' }] }], context);
  assert.match(badPole.errors.join(' '), /loại trụ/);
});

test('preserves the current owner on blank updates and flags mixed missing CMS codes', () => {
  const candidates = [{ id: 10, legacy_code: 'OLD-1', cms_code: 'CMS-1' }];
  const [existing] = inspectRows([{ ...baseRow, owner_name_system: '' }], { ...context, candidates });
  assert.equal(existing.action, 'update');
  assert.equal(existing.owner, null);
  const rows = inspectRows([{ ...baseRow }, { ...baseRow, row: 3, cms_code: '' }], context);
  assert.ok(rows.every(row => row.errors.some(error => /thiếu mã CMS/.test(error))));
});

test('shows partial progress and warns about unusual dates and historical finance', () => {
  const row = {
    ...baseRow, on_date: '2026-01-01', delivery_date: '2026-02-01',
    contract_date: '2026-03-01', payment_status: 'Hoàn thành',
    poles: [{ ...baseRow.poles[0], shipped: 2, received: 2, installed: 1, accepted: 0, on: 1 }]
  };
  const [result] = inspectRows([row], context);
  assert.equal(result.poles[0].on, 1);
  assert.equal(result.poles[0].accepted, 0);
  assert.match(result.warnings.join(' '), /ON trước ngày giao/);
  assert.match(result.warnings.join(' '), /ON trước ngày ký/);
  assert.match(result.warnings.join(' '), /không tạo giao dịch/);
  const [missingDate] = inspectRows([{ ...row, on_date: '' }], context);
  assert.match(missingDate.warnings.join(' '), /chưa nhập ngày ON đầu tiên/);
});

test('loads a real workbook without writing business data', async () => {
  const workbook = await createTemplate(catalog.poles);
  const sheet = workbook.worksheets[0];
  for (const [key, label] of FIELDS) {
    if (baseRow[key] !== undefined) sheet.getCell(2, sheet.getRow(1).values.indexOf(label)).value = baseRow[key];
  }
  for (const [key, label] of POLE_FIELDS) {
    if (baseRow.poles[0][key] !== undefined) {
      sheet.getCell(2, sheet.getRow(1).values.indexOf(`Trụ 1 - ${label}`)).value = baseRow.poles[0][key];
    }
  }
  const calls = [];
  const executor = { query: async (sql) => {
    calls.push(sql);
    if (sql.includes('FROM station_proposals')) return [[]];
    if (sql.includes('FROM users')) return [accounts];
    if (sql.includes('FROM charging_poles')) return [catalog.poles];
    if (sql.includes('FROM suppliers')) return [catalog.suppliers];
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const result = await preview(Buffer.from(await workbook.xlsx.writeBuffer()), accounts[0], executor);
  assert.equal(result[0].action, 'create');
  assert.deepEqual(result[0].errors, []);
  assert.ok(calls.every(sql => /^\s*SELECT\b/i.test(sql)));
  await assert.rejects(preview(Buffer.from('not a workbook'), accounts[0], executor), /Không đọc được file Excel/);
});

test('preview fingerprints existing records without exposing the snapshot', async () => {
  const workbook = await createTemplate(catalog.poles);
  const sheet = workbook.worksheets[0];
  for (const [key, label] of FIELDS) {
    if (baseRow[key] !== undefined) sheet.getCell(2, sheet.getRow(1).values.indexOf(label)).value = baseRow[key];
  }
  for (const [key, label] of POLE_FIELDS) {
    if (baseRow.poles[0][key] !== undefined) {
      sheet.getCell(2, sheet.getRow(1).values.indexOf(`Trụ 1 - ${label}`)).value = baseRow.poles[0][key];
    }
  }
  let status = 'DEPLOYING';
  const executor = { query: async sql => {
    if (sql.includes('LEFT JOIN charging_stations')) return [[{ id: 10, legacy_code: 'OLD-1', cms_code: 'CMS-1' }]];
    if (sql.includes('FROM station_proposals')) return [[{ id: 10, status, owner_phone: 'private', custom_data: { province: 'Hà Nội', mo_hinh_dau_tu: 'NQ' } }]];
    if (sql.includes('FROM charging_stations')) return [[]];
    if (sql.includes('FROM users')) return [accounts];
    if (sql.includes('FROM charging_poles')) return [catalog.poles];
    if (sql.includes('FROM suppliers')) return [catalog.suppliers];
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const file = Buffer.from(await workbook.xlsx.writeBuffer());
  const [before] = await preview(file, accounts[0], executor);
  status = 'ACTIVE';
  const [after] = await preview(file, accounts[0], executor);
  assert.match(before.snapshot_fingerprint, /^[0-9a-f]{64}$/);
  assert.notEqual(before.snapshot_fingerprint, after.snapshot_fingerprint);
  assert.equal(JSON.stringify(before).includes('private'), false);
});

test('preview reports conflict with the matched proposal real shipments', async () => {
  const workbook = await createTemplate(catalog.poles);
  const sheet = workbook.worksheets[0];
  for (const [key, label] of FIELDS) {
    if (baseRow[key] !== undefined) sheet.getCell(2, sheet.getRow(1).values.indexOf(label)).value = baseRow[key];
  }
  for (const [key, label] of POLE_FIELDS) {
    if (baseRow.poles[0][key] !== undefined) {
      sheet.getCell(2, sheet.getRow(1).values.indexOf(`Trụ 1 - ${label}`)).value = baseRow.poles[0][key];
    }
  }
  const executor = { query: async sql => {
    if (sql.includes('LEFT JOIN charging_stations')) return [[{ id: 10, legacy_code: 'OLD-1', cms_code: 'CMS-1' }]];
    if (sql.includes('FROM station_proposals')) return [[{ id: 10, custom_data: { province: 'Hà Nội', mo_hinh_dau_tu: 'NQ' } }]];
    if (sql.includes('FROM charging_stations')) return [[{ id: 20, proposal_id: 10 }]];
    if (sql.includes('FROM charging_station_commitments')) return [[{ id: 30, model: 'NQ', pole_id: 1 }]];
    if (sql.includes('FROM warehouse_exports')) return [[{ id: 40, destination_type: 'STATION', historical_import: 0 }]];
    if (sql.includes('FROM warehouse_export_items')) return [[{ id: 50, export_id: 40, commitment_id: 30, quantity: 5, returned_quantity: 0, received_quantity: 0 }]];
    if (sql.includes('FROM users')) return [accounts];
    if (sql.includes('FROM charging_poles')) return [catalog.poles];
    if (sql.includes('FROM suppliers')) return [catalog.suppliers];
    return [[]];
  } };
  const [result] = await preview(Buffer.from(await workbook.xlsx.writeBuffer()), accounts[0], executor);
  assert.match(result.errors.join(' '), /số chốt trong file \(2\) thấp hơn chứng từ thực \(5\)/);
});

test('preview blocks a valid total that cannot preserve real acceptance and ON overlap', async () => {
  const workbook = await createTemplate(catalog.poles);
  const sheet = workbook.worksheets[0];
  const pole = { ...baseRow.poles[0], proposed: 4, committed: 4, shipped: 4, received: 4,
    installed: 3, accepted: 2, on: 2, accepted_on: 2 };
  for (const [key, label] of FIELDS) {
    if (baseRow[key] !== undefined) sheet.getCell(2, sheet.getRow(1).values.indexOf(label)).value = baseRow[key];
  }
  for (const [key, label] of POLE_FIELDS) {
    if (pole[key] !== undefined) sheet.getCell(2, sheet.getRow(1).values.indexOf(`Trụ 1 - ${label}`)).value = pole[key];
  }
  const executor = { query: async sql => {
    if (sql.includes('LEFT JOIN charging_stations')) return [[{ id: 10, legacy_code: 'OLD-1', cms_code: 'CMS-1' }]];
    if (sql.includes('FROM station_proposals')) return [[{ id: 10, custom_data: { province: 'Hà Nội', mo_hinh_dau_tu: 'NQ' } }]];
    if (sql.includes('FROM charging_stations')) return [[{ id: 20, proposal_id: 10 }]];
    if (sql.includes('FROM charging_station_commitments')) return [[{ id: 30, model: 'NQ', pole_id: 1, quantity: 3 }]];
    if (sql.includes('FROM warehouse_exports')) return [[{ id: 40, destination_type: 'STATION', historical_import: 0 }]];
    if (sql.includes('FROM warehouse_export_items')) return [[{ id: 50, export_id: 40, commitment_id: 30,
      quantity: 3, returned_quantity: 0, received_quantity: 3 }]];
    if (sql.includes('FROM charging_station_deployments')) return [[
      { id: 60, export_item_id: 50, quantity: 2, installation_status: 'DONE', acceptance_status: 'PASSED', on_quantity: 1 },
      { id: 61, export_item_id: 50, quantity: 1, installation_status: 'NOT', acceptance_status: 'NOT', on_quantity: 0 }
    ]];
    if (sql.includes('FROM users')) return [accounts];
    if (sql.includes('FROM charging_poles')) return [catalog.poles];
    if (sql.includes('FROM suppliers')) return [catalog.suppliers];
    return [[]];
  } };
  const [result] = await preview(Buffer.from(await workbook.xlsx.writeBuffer()), accounts[0], executor);
  assert.match(result.errors.join(' '), /không thể phân bổ/);
});
