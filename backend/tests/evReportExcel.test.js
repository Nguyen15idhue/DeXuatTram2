const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { createWorkbook } = require('../src/services/evReportExcelService');

const row = id => ({
  id, full_name: id === 1 ? '=1+1' : `Khách ${id}`, phone: '0901234567',
  address: 'Địa chỉ', ward: 'Phường', province: 'Tỉnh', province_code: 'ABC',
  latitude: '21.12345678', longitude: '105.12345678',
  created_at: new Date('2026-11-17T02:00:00Z'), updated_at: new Date('2026-11-17T03:00:00Z'),
  custom_data: id === 501
    ? JSON.stringify({ hang_xe: 'VinFast', legacy_field: { value: 'cũ' }, constructor: 'giá trị cũ' })
    : { hang_xe: 'Khác', nhom_phuong_tien: ['Cá nhân', 'Kinh doanh'] }
});

const connection = rows => ({
  query: async (sql, params) => {
    if (sql.includes('field_definitions')) return [[
      { key: 'hang_xe', label: 'Hãng xe' },
      { key: 'nhom_phuong_tien', label: 'Nhóm phương tiện' },
      { key: 'inactive_field', label: 'Trường cũ' }
    ]];
    if (sql.includes('ev_charging_reports')) return [rows.filter(item => item.id > params[0]).slice(0, params[1])];
    throw new Error(`Unexpected query: ${sql}`);
  }
});

test('exports every batch with fixed, configured and legacy fields without losing phone zeros', async () => {
  const rows = Array.from({ length: 501 }, (_, index) => row(index + 1));
  const workbook = await createWorkbook(connection(rows));
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = restored.worksheets[0];
  const header = sheet.getRow(1).values;
  assert.equal(sheet.rowCount, 502);
  assert.equal(sheet.getCell(2, header.indexOf('Số điện thoại')).value, '0901234567');
  assert.equal(sheet.getCell(2, header.indexOf('Họ và tên')).value, '=1+1');
  assert.equal(sheet.getCell(2, header.indexOf('Nhóm phương tiện (nhom_phuong_tien)')).value, 'Cá nhân, Kinh doanh');
  assert.equal(sheet.getCell(502, header.indexOf('Hãng xe (hang_xe)')).value, 'VinFast');
  assert.equal(sheet.getCell(502, header.indexOf('legacy_field')).value, '{"value":"cũ"}');
  assert.equal(sheet.getCell(2, header.indexOf('constructor')).value, '');
  assert.equal(sheet.getCell(502, header.indexOf('constructor')).value, 'giá trị cũ');
  assert.deepEqual(JSON.parse(sheet.getCell(502, header.indexOf('Dữ liệu động gốc (JSON)')).value),
    { hang_xe: 'VinFast', legacy_field: { value: 'cũ' }, constructor: 'giá trị cũ' });
  assert.notEqual(header.indexOf('Trường cũ (inactive_field)'), -1);
});

test('exports an empty workbook and rejects values Excel cannot represent', async () => {
  const empty = await createWorkbook(connection([]));
  assert.equal(empty.worksheets[0].rowCount, 1);
  const oversized = row(1);
  oversized.custom_data = { old_field: 'x'.repeat(32768) };
  await assert.rejects(createWorkbook(connection([oversized])), /vượt giới hạn ô Excel/);
});

test('export endpoint authorizes only the current EV report manager roles', async () => {
  const express = require('express');
  const Module = require('node:module');
  process.env.JWT_SECRET ||= 'ev-export-test';
  const { requireUserManager } = require('../src/middlewares/auth');
  const nativeLoad = Module._load;
  const pass = (req, res, next) => next();
  Module._load = function (request, parent, isMain) {
    if (parent?.filename.endsWith('routes\\evReports.js') || parent?.filename.endsWith('routes/evReports.js')) {
      if (request === '../middlewares/auth') return {
        requireAuth(req, res, next) {
          if (!req.headers['x-test-role']) return res.sendStatus(401);
          req.user = { role: req.headers['x-test-role'] };
          next();
        },
        optionalAuth: pass,
        requireUserManager
      };
      if (request === '../middlewares/rateLimits') return {
        guestSubmitLimiter: pass, guestTrackLimiter: pass, adminLimiter: pass, excelLimiter: pass
      };
      if (request === '../controllers/evReportController') {
        const controller = new Proxy({}, { get: (target, key) => target[key] || ((req, res) => res.sendStatus(204)) });
        controller.adminExportExcel = (req, res) => res.status(200).send('excel');
        return controller;
      }
    }
    return nativeLoad.call(this, request, parent, isMain);
  };
  let router;
  try { router = require('../src/routes/evReports'); } finally { Module._load = nativeLoad; }
  const app = express();
  app.use('/api/ev-reports', router);
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/ev-reports/admin/export`;
    assert.equal((await fetch(url)).status, 401);
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'SALES']) {
      assert.equal((await fetch(url, { headers: { 'x-test-role': role } })).status, 200);
    }
    for (const role of ['CTV', 'NPP', 'MKT']) {
      assert.equal((await fetch(url, { headers: { 'x-test-role': role } })).status, 403);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
