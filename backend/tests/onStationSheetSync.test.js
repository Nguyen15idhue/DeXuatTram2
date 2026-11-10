const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const service = require('../src/services/onStationSheetSyncService');

const proposal = (overrides = {}) => ({
  id: 1, ma_tram: 'ON-INTERNAL', cms_station_code: 'EMS001',
  owner_name: 'Contact, not assignee', assignee_name: 'Assigned person',
  assignee_role: 'SALES', assignee_custom_data: { department: 'Trung tâm KD miền Bắc' },
  custom_data: {
    mo_hinh_dau_tu: 'LK',
    loai_tru_lk: [{ so_luong: 4, loai_tru: 'DC60Kw' }]
  },
  chot_so_luong_tru: [
    { mo_hinh: 'LK', so_luong: 2, loai_tru: 'DC120Kw' },
    { mo_hinh: 'NQ', so_luong: 1, loai_tru: { label: 'AC 22kW' } }
  ],
  ...overrides
});

test('exports exact B/E/F/M/N/O values and only seventeen columns', () => {
  const row = service.buildRow(proposal(), 7);
  assert.equal(row.length, 17);
  assert.equal(row[1], 'EMS001');
  assert.equal(row[4], 'Assigned person');
  assert.equal(row[5], 'MB');
  assert.equal(row[12], 'LK_4 DC 60kW');
  assert.equal(row[13], 'LK_2 DC 120kW + NQ_1 AC 22kW');
  assert.equal(row[14], 3);
  assert.equal(typeof row[14], 'number');
});

test('source uses assignee department, with NPP before TDT', () => {
  const row = (overrides) => service.buildRow(proposal(overrides), 1);
  assert.equal(row({ assignee_role: 'NPP', mo_hinh_dau_tu: 'TDT' })[5], 'NPP');
  assert.equal(row({ mo_hinh_dau_tu: 'TDT' })[5], 'TMT');
  for (const [region, code] of [['Bắc', 'MB'], ['Trung', 'MT'], ['Nam', 'MN']]) {
    assert.equal(row({
      assignee_custom_data: JSON.stringify({ department: `Trung tâm Kinh doanh miền ${region}` }),
      vung_mien: 'wrong proposal region'
    })[5], code);
  }
});

test('initial scale uses model-specific tables, JSON wrappers and legacy rows, not commitment', () => {
  const custom = {
    mo_hinh_dau_tu: 'NQ_LK',
    loai_tru_nq: JSON.stringify({ rows: [{ so_luong: '1', loai_tru: 'AC22Kw' }] }),
    loai_tru_lk: { data: [{ so_luong: 2, loai_tru: 'DC120Kw' }] },
    tdt_tru: [{ so_luong: 99, loai_tru: 'DC999Kw' }]
  };
  assert.equal(service.buildRow(proposal({ custom_data: custom }), 1)[12], 'NQ_1 AC 22kW + LK_2 DC 120kW');
  assert.equal(service.buildRow(proposal({
    custom_data: { mo_hinh_dau_tu: 'TDT', tdt_tru: [{ so_luong: 3, loai_tru: 'DC60Kw' }] }
  }), 1)[12], 'TDT_3 DC 60kW');
  assert.equal(service.buildRow(proposal({
    custom_data: { mo_hinh_dau_tu: 'NQ', loai_tru: 'AC22Kw', so_luong_tru: 2 }
  }), 1)[12], 'NQ_2 AC 22kW');
});

test('invalid data is reported rather than substituting contact, internal code or proposed poles', () => {
  for (const overrides of [
    { cms_station_code: '' }, { assignee_name: null },
    { assignee_custom_data: { department: 'Other' } },
    { chot_so_luong_tru: [] },
    { chot_so_luong_tru: [{ so_luong: -1 }] },
    { chot_so_luong_tru: [{ so_luong: 1.5 }] }
  ]) assert.throws(() => service.buildRow(proposal(overrides), 1));
});

const sheetMock = (rows, readError) => {
  const calls = [];
  return {
    calls,
    spreadsheets: { values: {
      get: async () => {
        if (readError) throw readError;
        return { data: { values: rows } };
      },
      batchUpdate: async (request) => { calls.push(request); },
      clear: async (request) => { calls.push(request); }
    } }
  };
};
const config = { spreadsheetId: 'test-only', tabName: 'ON stations' };
const jobs = [{ proposal_id: 1, operation: 'UPSERT', requested_version: 1 }];

test('sheet updates, inserts, deletes only A-Q, keyed by EMS; read failure never appends', async () => {
  const originalQuery = pool.query;
  const queries = [];
  pool.query = async (...args) => { queries.push(args); return [[]]; };
  try {
    const sheet = sheetMock([service.HEADER_ROW, [5, 'EMS001']]);
    await service.writeSheetRows(sheet, config, jobs, new Map([[1, proposal()]]), new Map([[1, 'EMS001']]));
    assert.equal(sheet.calls[0].requestBody.data[0].range, "'ON stations'!A2:Q2");
    assert.equal(sheet.calls[0].requestBody.data[0].values[0][0], 5);
    const insert = sheetMock([service.HEADER_ROW, [5, 'EMS-OTHER']]);
    await service.writeSheetRows(insert, config, jobs, new Map([[1, proposal()]]), new Map([[1, 'EMS001']]));
    assert.equal(insert.calls[0].requestBody.data[0].range, "'ON stations'!A3:Q3");
    const empty = sheetMock([]);
    await service.writeSheetRows(empty, config, jobs, new Map([[1, proposal()]]), new Map([[1, 'EMS001']]));
    assert.deepEqual(empty.calls[0].requestBody.data.map(row => row.range), ["'ON stations'!A1:Q1", "'ON stations'!A2:Q2"]);
    const deletion = sheetMock([service.HEADER_ROW, [5, 'EMS001']]);
    await service.writeSheetRows(deletion, config, [{ ...jobs[0], operation: 'DELETE' }], new Map(), new Map([[1, 'EMS001']]));
    assert.equal(deletion.calls[0].range, "'ON stations'!A2:Q2");
    const broken = sheetMock([], new Error('Google read failed'));
    await assert.rejects(service.writeSheetRows(broken, config, jobs, new Map([[1, proposal()]]), new Map()), /Google read failed/);
    assert.deepEqual(broken.calls, []);
    assert.equal(queries.length, 4);
  } finally { pool.query = originalQuery; }
});

test('duplicates on Sheet, in a batch and in DB fail before writes', async () => {
  const originalQuery = pool.query;
  try {
    const duplicateSheet = sheetMock([service.HEADER_ROW, [1, 'EMS001'], [2, 'EMS001']]);
    await assert.rejects(service.writeSheetRows(duplicateSheet, config, jobs, new Map([[1, proposal()]]), new Map()), /trùng/);
    assert.deepEqual(duplicateSheet.calls, []);
    const sheet = sheetMock([service.HEADER_ROW]);
    await assert.rejects(service.writeSheetRows(sheet, config, [...jobs, { ...jobs[0], proposal_id: 2 }],
      new Map([[1, proposal()], [2, proposal({ id: 2 })]]), new Map()), /trùng/);
    assert.deepEqual(sheet.calls, []);
    pool.query = async (sql) => sql.includes('GROUP BY')
      ? [[{ code: 'EMS001' }]] : [[{ id: 1, cms_station_code: 'EMS001' }]];
    await assert.rejects(service.loadProposalKeys([1]), /trùng trong DB/);
  } finally { pool.query = originalQuery; }
});

test('repeated reconciliation preserves R onward and never inserts or shifts whole rows', async () => {
  const originalQuery = pool.query;
  const cells = [service.HEADER_ROW.concat('External header'), [1, 'EMS001', ...Array(15).fill(''), 'External note']];
  const apply = ({ range, values }) => {
    const match = range.match(/!A(\d+):Q\d+$/);
    assert.ok(match, range);
    const index = Number(match[1]) - 1;
    cells[index] ||= [];
    for (let column = 0; column < 17; column++) cells[index][column] = values[0][column];
  };
  const sheet = { spreadsheets: { values: {
    get: async () => ({ data: { values: cells.map(row => row.slice(0, 17)) } }),
    batchUpdate: async request => { request.requestBody.data.forEach(apply); },
    clear: async request => apply({ ...request, values: [Array(17).fill('')] })
  } } };
  pool.query = async () => [[]];
  try {
    for (let index = 0; index < 2; index++) {
      await service.writeSheetRows(sheet, config, jobs, new Map([[1, proposal()]]), new Map([[1, 'EMS001']]));
    }
    assert.equal(cells.length, 2);
    assert.equal(cells[1][17], 'External note');
    await service.writeSheetRows(sheet, config, [{ ...jobs[0], operation: 'DELETE' }], new Map(), new Map([[1, 'EMS001']]));
    assert.equal(cells[1][17], 'External note');
    assert.equal(cells[0][17], 'External header');
    assert.equal(cells.length, 2);
  } finally { pool.query = originalQuery; }
});

test('load query joins assigned user, not proposal creator or contact', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    assert.match(sql, /\$\.nguoi_phu_trach\.id/);
    assert.match(sql, /assignee\.full_name AS assignee_name/);
    assert.match(sql, /cs\.cms_station_code/);
    return [[]];
  };
  try { await service.loadProposals([1]); } finally { pool.query = originalQuery; }
});

test('one invalid proposal fails explicitly without blocking valid proposals in the batch', async () => {
  const { google } = require('googleapis');
  const original = {
    query: pool.query, connection: pool.getConnection,
    sheets: google.sheets, getClient: google.auth.GoogleAuth.prototype.getClient
  };
  const env = ['ON_STATION_GOOGLE_SHEETS_SPREADSHEET_ID', 'ON_STATION_GOOGLE_SHEETS_TAB_NAME', 'GOOGLE_APPLICATION_CREDENTIALS'];
  const oldEnv = env.map(key => process.env[key]);
  const sheet = sheetMock([service.HEADER_ROW]);
  const updates = [];
  try {
    env.forEach(key => { process.env[key] = 'test-only'; });
    google.auth.GoogleAuth.prototype.getClient = async () => ({});
    google.sheets = () => sheet;
    pool.query = async (sql, params) => {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes("status IN ('PENDING','FAILED')") && sql.includes('SELECT')) {
        return [[{ ...jobs[0], attempt_count: 0 }, { ...jobs[0], proposal_id: 2, attempt_count: 0 }]];
      }
      if (sql.includes('assignee.full_name')) return [[proposal(), proposal({ id: 2, cms_station_code: 'EMS002', assignee_name: null })]];
      if (sql.includes('SELECT p.id, cs.cms_station_code')) {
        return [[{ id: 1, cms_station_code: 'EMS001' }, { id: 2, cms_station_code: 'EMS002' }]];
      }
      if (sql.includes('UPDATE')) updates.push({ sql, params });
      return [[]];
    };
    pool.getConnection = async () => ({ query: pool.query, release: () => {} });
    assert.deepEqual(await service.processBatch(), { processed: 1, failed: 1 });
    assert.equal(sheet.calls[0].requestBody.data[0].values[0][1], 'EMS001');
    assert.ok(updates.some(update => update.sql.includes("status = 'FAILED'") && update.params[1] === 2));
    assert.ok(updates.some(update => update.sql.includes("status = 'DONE'") && update.params[0] === 1));
  } finally {
    pool.query = original.query;
    pool.getConnection = original.connection;
    google.sheets = original.sheets;
    google.auth.GoogleAuth.prototype.getClient = original.getClient;
    env.forEach((key, index) => {
      if (oldEnv[index] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[index];
    });
  }
});

test.after(async () => { await pool.end(); });
