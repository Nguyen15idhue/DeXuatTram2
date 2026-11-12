const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const service = require('../src/services/onStationSheetSyncService');

const proposal = (overrides = {}) => ({
  id: 1, ma_tram: 'ON-INTERNAL', cms_station_code: 'EMS001',
  ma_de_xuat_gen: 'LK_HNO_0001',
  owner_name: 'Contact, not assignee', assignee_name: 'Assigned person',
  assignee_role: 'SALES', assignee_custom_data: { department: 'Trung tâm KD miền Bắc' },
  creator_role: 'SALES', creator_custom_data: { department: 'Trung tâm KD miền Bắc' },
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

test('exports exact B/E/F/M/N/O/S values and skips R', () => {
  const row = service.buildRow(proposal(), 7);
  assert.equal(row.length, 19);
  assert.equal(row[17], null);
  assert.equal(row[18], 'LK_HNO_0001');
  assert.equal(service.HEADER_ROW[17], null);
  assert.equal(service.HEADER_ROW[18], 'Mã BCĐX');
  assert.equal(row[1], 'EMS001');
  assert.equal(row[4], 'Assigned person');
  assert.equal(row[5], 'MB');
  assert.equal(row[12], 'LK_4 DC 60kW');
  assert.equal(row[13], 'LK_2 DC 120kW + NQ_1 AC 22kW');
  assert.equal(row[14], 3);
  assert.equal(typeof row[14], 'number');
});

test('source uses creator department, with TDT before NPP and PDA before regional codes', () => {
  const row = (overrides) => service.buildRow(proposal(overrides), 1);
  assert.equal(row({ creator_role: 'NPP', mo_hinh_dau_tu: 'TDT' })[5], 'TMT');
  assert.equal(row({ creator_role: 'NPP' })[5], 'NPP');
  assert.equal(row({ creator_custom_data: { department: 'Phòng Chính sách và Phát triển dự án' } })[5], 'PDA');
  assert.equal(row({ creator_custom_data: {} })[5], '');
  assert.equal(row({ mo_hinh_dau_tu: 'TDT' })[5], 'TMT');
  for (const [region, code] of [['Bắc', 'MB'], ['Trung', 'MT'], ['Nam', 'MN']]) {
    assert.equal(row({
      creator_custom_data: JSON.stringify({ department: `Trung tâm Kinh doanh miền ${region}` }),
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
  assert.equal(service.buildRow(proposal({ custom_data: custom }), 1)[12], 'LK_2 DC 120kW + NQ_1 AC 22kW + TDT_99 DC 999kW');
  assert.equal(service.buildRow(proposal({
    custom_data: { mo_hinh_dau_tu: 'TDT', tdt_tru: [{ so_luong: 3, loai_tru: 'DC60Kw' }] }
  }), 1)[12], 'TDT_3 DC 60kW');
  assert.equal(service.buildRow(proposal({
    custom_data: { mo_hinh_dau_tu: 'NQ', loai_tru: 'AC22Kw', so_luong_tru: 2 }
  }), 1)[12], 'NQ_2 AC 22kW');
});

test('missing optional data does not block sync; invalid commitments fall back to initial scale', () => {
  for (const overrides of [
    { cms_station_code: '' }, { assignee_name: null },
    { assignee_custom_data: { department: 'Other' } },
    { chot_so_luong_tru: [] },
    { chot_so_luong_tru: [{ so_luong: -1 }] },
    { chot_so_luong_tru: [{ so_luong: 1.5 }] }
  ]) assert.doesNotThrow(() => service.buildRow(proposal(overrides), 1));
  const row = service.buildRow(proposal({ cms_station_code: '', assignee_name: null, chot_so_luong_tru: [] }), 1);
  assert.equal(row[1], '');
  assert.equal(row[4], '');
  assert.equal(row[13], row[12]);
  assert.equal(row[14], 4);
  const partial = service.buildRow(proposal({
    chot_so_luong_tru: [null, { mo_hinh: 'LK', so_luong: 0 }, { mo_hinh: 'LK', so_luong: 2, loai_tru: 'DC60Kw' }]
  }), 1);
  assert.equal(partial[14], 2);
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
const keys = () => new Map([[1, { code: 'LK_HNO_0001', cms: 'EMS001' }]]);

test('sheet updates and inserts A-S, deletes A-Q and S, migrates CMS legacy rows', async () => {
  const originalQuery = pool.query;
  const queries = [];
  pool.query = async (...args) => { queries.push(args); return [[]]; };
  try {
    const sheet = sheetMock([service.HEADER_ROW, [5, 'EMS001']]);
    await service.writeSheetRows(sheet, config, jobs, new Map([[1, proposal()]]), keys());
    assert.equal(sheet.calls[0].requestBody.data[1].range, "'ON stations'!A2:S2");
    assert.equal(sheet.calls[0].requestBody.data[1].values[0][0], 5);
    const insert = sheetMock([service.HEADER_ROW, [5, 'EMS-OTHER']]);
    await service.writeSheetRows(insert, config, jobs, new Map([[1, proposal()]]), keys());
    assert.equal(insert.calls[0].requestBody.data[1].range, "'ON stations'!A3:S3");
    const empty = sheetMock([]);
    await service.writeSheetRows(empty, config, jobs, new Map([[1, proposal()]]), keys());
    assert.deepEqual(empty.calls[0].requestBody.data.map(row => row.range), ["'ON stations'!A1:S1", "'ON stations'!A2:S2"]);
    const deletion = sheetMock([service.HEADER_ROW, [5, 'EMS001']]);
    await service.writeSheetRows(deletion, config, [{ ...jobs[0], operation: 'DELETE' }], new Map(), keys());
    assert.equal(deletion.calls[1].range, "'ON stations'!A2:Q2");
    assert.equal(deletion.calls[2].range, "'ON stations'!S2:S2");
    const broken = sheetMock([], new Error('Google read failed'));
    await assert.rejects(service.writeSheetRows(broken, config, jobs, new Map([[1, proposal()]]), new Map()), /Google read failed/);
    assert.deepEqual(broken.calls, []);
    assert.equal(queries.length, 4);
  } finally { pool.query = originalQuery; }
});

test('duplicate values in R are ignored when matching the proposal code in S', async (t) => {
  t.mock.method(pool, 'query', async () => [[]]);
  const first = service.buildRow(proposal(), 1);
  const second = service.buildRow(proposal({ ma_de_xuat_gen: 'OTHER_CODE' }), 2);
  first[17] = second[17] = 'LK00000031';
  const sheet = sheetMock([service.HEADER_ROW, first, second]);
  await service.writeSheetRows(sheet, config, jobs, new Map([[1, proposal()]]), keys());
  const update = sheet.calls[0].requestBody.data[1];
  assert.equal(update.range, "'ON stations'!A2:S2");
  assert.equal(update.values[0][17], null);
  assert.equal(update.values[0][18], 'LK_HNO_0001');
});

test('duplicates on Sheet, in a batch and in DB fail before writes', async () => {
  const originalQuery = pool.query;
  try {
    const row = service.buildRow(proposal(), 1);
    const duplicateSheet = sheetMock([service.HEADER_ROW, row, row]);
    await assert.rejects(service.writeSheetRows(duplicateSheet, config, jobs, new Map([[1, proposal()]]), new Map()), /trùng/);
    assert.deepEqual(duplicateSheet.calls, []);
    const sheet = sheetMock([service.HEADER_ROW]);
    await assert.rejects(service.writeSheetRows(sheet, config, [...jobs, { ...jobs[0], proposal_id: 2 }],
      new Map([[1, proposal()], [2, proposal({ id: 2 })]]), new Map()), /trùng/);
    assert.deepEqual(sheet.calls, []);
    pool.query = async (sql) => sql.includes('SELECT')
      ? [[{ id: 1, proposal_code: 'LK_HNO_0001', cms_station_code: '' }]] : [[]];
    assert.deepEqual((await service.loadProposalKeys([1])).get(1), { code: 'LK_HNO_0001', cms: '', ambiguousCms: false });
    pool.query = async () => [[{ id: 1, proposal_code: 'DX1', code_count: 2 }]];
    await assert.rejects(service.loadProposalKeys([1]), /trùng trong DB/);
  } finally { pool.query = originalQuery; }
});

test('repeated reconciliation preserves R and T onward, including headers and deletion', async () => {
  const originalQuery = pool.query;
  const cells = [service.HEADER_ROW.concat('External header'), [...service.buildRow(proposal(), 1), 'External note']];
  cells[0][17] = 'Custom R header';
  cells[1][17] = '=CUSTOM_FORMULA()';
  const apply = ({ range, values }) => {
    const match = range.match(/!([AS])(\d+):([QS])\d+$/);
    assert.ok(match, range);
    const index = Number(match[2]) - 1;
    const start = match[1] === 'A' ? 0 : 18;
    cells[index] ||= [];
    for (let column = 0; column < values[0].length; column++) {
      if (values[0][column] !== null) cells[index][start + column] = values[0][column];
    }
  };
  const sheet = { spreadsheets: { values: {
    get: async request => {
      assert.equal(request.range, "'ON stations'!A1:S");
      return { data: { values: cells.map(row => row.slice(0, 19)) } };
    },
    batchUpdate: async request => { request.requestBody.data.forEach(apply); },
    clear: async request => apply({ ...request, values: [Array(request.range.includes('!A') ? 17 : 1).fill('')] })
  } } };
  pool.query = async () => [[]];
  try {
    for (let index = 0; index < 2; index++) {
      await service.writeSheetRows(sheet, config, jobs, new Map([[1, proposal()]]), keys());
    }
    assert.equal(cells.length, 2);
    assert.equal(cells[1][19], 'External note');
    assert.equal(cells[1][17], '=CUSTOM_FORMULA()');
    assert.equal(cells[1][18], 'LK_HNO_0001');
    await service.writeSheetRows(sheet, config, [{ ...jobs[0], operation: 'DELETE' }], new Map(), keys());
    assert.equal(cells[1][19], 'External note');
    assert.equal(cells[0][19], 'External header');
    assert.equal(cells[0][17], 'Custom R header');
    assert.equal(cells[1][17], '=CUSTOM_FORMULA()');
    assert.equal(cells[1][18], '');
    assert.ok(cells[1].slice(0, 17).every(value => value === ''));
    assert.equal(cells.length, 2);
  } finally { pool.query = originalQuery; }
});

test('load query uses assigned user for E and independently joins creator for F', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    assert.match(sql, /\$\.nguoi_phu_trach\.id/);
    assert.match(sql, /assignee\.full_name AS assignee_name/);
    assert.match(sql, /LEFT JOIN users creator ON creator.id = p.user_id/);
    assert.match(sql, /cs\.cms_station_code/);
    return [[]];
  };
  try { await service.loadProposals([1]); } finally { pool.query = originalQuery; }
});

test('missing assignee does not fail or block either proposal in the batch', async () => {
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
      if (sql.includes('q.proposal_id AS id')) {
        return [[{ id: 1, proposal_code: 'DX1', cms_station_code: 'EMS001' }, { id: 2, proposal_code: 'DX2', cms_station_code: 'EMS002' }]];
      }
      if (sql.includes('UPDATE')) updates.push({ sql, params });
      return [[]];
    };
    pool.getConnection = async () => ({ query: pool.query, release: () => {} });
    assert.deepEqual(await service.processBatch(), { processed: 2, failed: 0 });
    assert.equal(sheet.calls[0].requestBody.data[1].values[0][1], 'EMS001');
    assert.equal(updates.some(update => update.sql.includes("status = 'FAILED'")), false);
    assert.ok(updates.some(update => update.sql.includes("'DONE', 'PENDING'") && update.params[3] === 1));
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

test('S locates rows without CMS, preserves missing cells and accepts zero coordinates', async (t) => {
  t.mock.method(pool, 'query', async () => [[]]);
  const existing = service.buildRow(proposal(), 9);
  existing[4] = 'Keep assigned person';
  existing[5] = 'Keep source';
  existing[16] = 'External investor';
  const sheet = sheetMock([service.HEADER_ROW, existing]);
  const updated = proposal({
    cms_station_code: '', assignee_name: null, creator_custom_data: {},
    latitude: 0, longitude: 0, chot_so_luong_tru: [],
  });
  await service.writeSheetRows(sheet, config, jobs, new Map([[1, updated]]),
    new Map([[1, { code: 'LK_HNO_0001', cms: '' }]]));
  const data = sheet.calls[0].requestBody.data[1];
  assert.equal(data.range, "'ON stations'!A2:S2");
  assert.equal(data.values[0][1], null);
  assert.equal(data.values[0][4], null);
  assert.equal(data.values[0][5], null);
  assert.equal(data.values[0][7], '0');
  assert.equal(data.values[0][16], null);
  assert.equal(data.values[0][14], 4);
});

test('new row without CMS exports with S; missing key and ambiguous legacy CMS never write', async (t) => {
  t.mock.method(pool, 'query', async () => [[]]);
  const sheet = sheetMock([service.HEADER_ROW]);
  await service.writeSheetRows(sheet, config, jobs,
    new Map([[1, proposal({ cms_station_code: '' })]]),
    new Map([[1, { code: 'LK_HNO_0001', cms: '' }]]));
  assert.equal(sheet.calls[0].requestBody.data[1].values[0][1], '');
  assert.equal(sheet.calls[0].requestBody.data[1].values[0][17], null);
  assert.equal(sheet.calls[0].requestBody.data[1].values[0][18], 'LK_HNO_0001');
  const noKey = sheetMock([service.HEADER_ROW]);
  await assert.rejects(service.writeSheetRows(noKey, config, jobs,
    new Map([[1, proposal({ ma_de_xuat_gen: '' })]]), new Map()), /thiếu mã BCĐX/);
  assert.deepEqual(noKey.calls, []);
  const duplicate = sheetMock([service.HEADER_ROW, [1, 'EMS001'], [2, 'EMS001']]);
  await assert.rejects(service.writeSheetRows(duplicate, config, jobs,
    new Map([[1, proposal()]]), keys()), /ghép duy nhất/);
  assert.deepEqual(duplicate.calls, []);
});

test.after(async () => { await pool.end(); });
