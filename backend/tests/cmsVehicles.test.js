const test = require('node:test');
const assert = require('node:assert/strict');
const { google } = require('googleapis');
const cmsApi = require('../src/services/cmsApiService');
const reports = require('../src/services/cmsReportService');
const vehicles = require('../src/services/cmsVehicleSheetService');

const fakeSheets = (t, rows) => {
  const writes = [];
  t.mock.method(google.auth.GoogleAuth.prototype, 'getClient', async () => ({}));
  t.mock.method(google, 'sheets', () => ({
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: {
        sheetId: 7, title: 'thong_tin_xe', gridProperties: { rowCount: 100, columnCount: 26 },
      } }] } }),
      batchUpdate: async () => ({}),
      values: {
        get: async () => ({ data: { values: rows } }),
        update: async request => { writes.push(request); return {}; },
        batchUpdate: async request => { writes.push(request); return {}; },
      },
    },
  }));
  return writes;
};

test('exports CMS vehicle fields once, updates existing rows and preserves missing values', async (t) => {
  const oldKey = process.env.CMS_API_KEY;
  process.env.CMS_API_KEY = 'fixture-key';
  t.after(() => { if (oldKey === undefined) delete process.env.CMS_API_KEY; else process.env.CMS_API_KEY = oldKey; });
  t.mock.method(reports, 'getConfig', () => ({
    configured: true, spreadsheetId: 'fixture', credentialsFile: 'fixture',
  }));
  const existing = [1, 'Biển cũ', '', 8, 'ACTIVE', 'CAR', '', '', '', 'VIN cũ', '', '', 'EVCC cũ'];
  const writes = fakeSheets(t, [vehicles.HEADERS, existing]);
  const requests = [];
  t.mock.method(global, 'fetch', async url => {
    requests.push(url);
    if (url.pathname.endsWith('/profile')) return Response.json({
      result: 'success', profile: { expirationDate: '2030-01-01T00:00:00Z' },
    });
    const page = Number(url.searchParams.get('page'));
    return Response.json({
      result: 'success', page, limit: 1, total: 2,
      vehicles: page === 0 ? [{
        vehicleId: 1, plate: '', userId: 8, status: 'ACTIVE', vehicleType: 'CAR',
        user: { fullname: 'Khách mẫu', phone: 'không xuất', email: 'không xuất' },
        model: { name: 'Dòng mẫu', brand: { name: 'Hãng mẫu' }, batteryCapacity: 0 },
        cards: [{ idTag: 'TAG1' }, { idTag: 'TAG2' }], autoCharge: false,
        vinNumber: null, vehicleIdentity: null, createdAt: '2026-11-20T18:00:00Z',
        updatedAt: '2026-11-21T02:00:00Z',
      }] : [{
        vehicleId: 2, plate: 'Biển mới', userId: 9, autoCharge: true,
        user: { fullname: 'Khách mới' }, model: { name: 'Dòng mới', brand: { name: 'Hãng mới' }, batteryCapacity: 60 },
        cards: [], createdAt: '2026-11-20T18:00:00Z',
      }],
    });
  });
  const result = await vehicles.runVehicleSync({ from: '2026-11-21', to: '2026-11-21' });
  assert.deepEqual(result, { total: 2, filtered: 2, added: 1, updated: 1, skipped: 0 });
  assert.equal(requests.filter(url => url.pathname.endsWith('/vehicle')).length, 2);
  const data = writes.flatMap(write => write.requestBody?.data || []);
  const byRange = Object.fromEntries(data.map(item => [item.range, item.values[0]]));
  assert.deepEqual(byRange["'thong_tin_xe'!C2"], ['Khách mẫu']);
  assert.deepEqual(byRange["'thong_tin_xe'!G2"], ['Hãng mẫu']);
  assert.deepEqual(byRange["'thong_tin_xe'!H2"], ['Dòng mẫu']);
  assert.deepEqual(byRange["'thong_tin_xe'!I2"], [0]);
  assert.deepEqual(byRange["'thong_tin_xe'!K2"], ['TAG1, TAG2']);
  assert.deepEqual(byRange["'thong_tin_xe'!L2"], ['Thủ công']);
  assert.equal(byRange["'thong_tin_xe'!B2"], undefined);
  assert.equal(byRange["'thong_tin_xe'!J2"], undefined);
  assert.equal(byRange["'thong_tin_xe'!M2"], undefined);
  assert.deepEqual(byRange["'thong_tin_xe'!A3:O3"], [
    2, 'Biển mới', 'Khách mới', 9, '', '', 'Hãng mới', 'Dòng mới', 60, '', '',
    'Tự động', '', '2026-11-20T18:00:00Z', '',
  ]);
  assert.doesNotMatch(JSON.stringify(data), /không xuất/);
});

test('rejects duplicate Sheet keys without writing', async (t) => {
  const writes = fakeSheets(t, [vehicles.HEADERS, [12], [12]]);
  const config = { spreadsheetId: 'fixture', credentialsFile: 'fixture', tabName: 'thong_tin_xe' };
  await assert.rejects(vehicles.createVehicleSheetWriter(config), /A2 và A3/);
  assert.equal(writes.length, 0);
});

test('rejects incompatible headers without overwriting the tab', async (t) => {
  const writes = fakeSheets(t, [['Mã xe', 'Không đúng'], [1]]);
  const config = { spreadsheetId: 'fixture', credentialsFile: 'fixture', tabName: 'thong_tin_xe' };
  await assert.rejects(vehicles.createVehicleSheetWriter(config), { statusCode: 409 });
  assert.equal(writes.length, 0);
});

test('repeat writes are idempotent and preserve empty CMS fields', async (t) => {
  const writes = fakeSheets(t, [vehicles.HEADERS, [1, 'Biển cũ', 'Tên cũ']]);
  const writer = await vehicles.createVehicleSheetWriter({
    spreadsheetId: 'fixture', credentialsFile: 'fixture', tabName: 'thong_tin_xe',
  });
  const rows = [{ vehicleId: 1, plate: '', customerName: 'Tên mới' }];
  assert.deepEqual(await writer.write(rows), { added: 0, updated: 1, skipped: 0 });
  assert.deepEqual(await writer.write(rows), { added: 0, updated: 0, skipped: 1 });
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].requestBody.data, [
    { range: "'thong_tin_xe'!C2", values: [['Tên mới']] },
  ]);
});

test('blocks concurrent runs and validates dates before contacting CMS', async (t) => {
  t.mock.method(reports, 'getConfig', () => ({ configured: true }));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  t.mock.method(cmsApi, 'createClient', () => ({ renewKey: () => gate, getVehicles: async () => [] }));
  await assert.rejects(vehicles.runVehicleSync({ from: '2026-02-30' }), { statusCode: 400 });
  const first = vehicles.runVehicleSync({ all: true });
  await assert.rejects(vehicles.runVehicleSync({ all: true }), { statusCode: 409 });
  fakeSheets(t, [vehicles.HEADERS]);
  release();
  assert.deepEqual(await first, { total: 0, filtered: 0, added: 0, updated: 0, skipped: 0 });
});
