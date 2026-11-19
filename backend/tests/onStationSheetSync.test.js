const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const service = require('../src/services/onStationSheetSyncService');

const proposal = (overrides = {}) => ({
  id: 1, ma_tram: 'ON-INTERNAL', cms_station_code: 'EMS001',
  ma_de_xuat_gen: 'LK_HNO_0001',
  owner_name: 'Contact, not assignee', assignee_name: 'Assigned person',
  assignee_role: 'SALES', assignee_custom_data: { department: 'Trung tâm KD miền Bắc' },
  creator_name: 'Creator sales', creator_role: 'SALES', creator_custom_data: { department: 'Trung tâm KD miền Bắc' },
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

test('exports all twenty A-T columns in the required order, including duplicated personnel and source', () => {
  const row = service.buildRow(proposal({
    station_name: 'Trạm fixture', latitude: 21, longitude: 105,
    address: 'Địa chỉ fixture, Hà Nội', province: 'Hà Nội', on_date: '2026-11-18'
  }), 7);
  assert.deepEqual(service.HEADER_ROW, [
    'STT', 'Mã Trạm', 'Tên trạm sạc', 'Pháp nhân', 'Nhân sự phụ trách', 'Nguồn phụ trách',
    'Link Google Map', 'Vĩ độ', 'Kinh độ', 'Địa chỉ chi tiết', 'Tỉnh cũ', 'Tỉnh mới',
    'Quy mô trụ ban đầu', 'Quy mô trụ chốt triển khai', 'Số lượng trụ', 'Ngày ON trạm',
    'Mã chủ đầu tư', 'Mã BCĐX', 'GĐKV phát triển trạm', 'Phòng ban'
  ]);
  assert.deepEqual(row, [
    7, 'EMS001', 'Trạm fixture', 'Contact, not assignee', 'Creator sales', 'MB',
    'https://www.google.com/maps?q=21%2C105', '21', '105', 'Địa chỉ fixture, Hà Nội', 'Hà Nội', 'Hà Nội',
    'LK_4 DC 60kW', 'LK_2 DC 120kW + NQ_1 AC 22kW', 3, '18/11/2026',
    '', 'LK_HNO_0001', 'Creator sales', 'MB'
  ]);
});

test('E and S prefer SALES creators, otherwise use the assigned account without role or parent inference', () => {
  for (const [overrides, expected] of [
    [{}, 'Creator sales'],
    [{ creator_role: 'CTV' }, 'Assigned person'],
    [{ creator_role: 'NPP', assignee_role: 'NPP' }, 'Assigned person'],
    [{ creator_role: 'ADMIN', assignee_role: 'ADMIN' }, 'Assigned person'],
    [{ creator_name: '   ' }, 'Assigned person'],
    [{ creator_role: null, creator_name: null }, 'Assigned person'],
    [{ creator_role: 'CTV', assignee_name: null, parent_name: 'Not a fallback' }, ''],
    [{ creator_name: null, assignee_name: null }, '']
  ]) {
    const row = service.buildRow(proposal(overrides), 1);
    assert.equal(row[4], expected);
    assert.equal(row[18], expected);
  }
});

test('source uses creator department, with TDT before NPP and PDA before regional codes', () => {
  const row = (overrides) => {
    const result = service.buildRow(proposal(overrides), 1);
    assert.equal(result[19], result[5]);
    return result;
  };
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
  const row = service.buildRow(proposal({ cms_station_code: '', creator_name: null, assignee_name: null, chot_so_luong_tru: [] }), 1);
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

test('sheet updates, inserts and clears A-T using the code in R while preserving existing serials', async () => {
  const originalQuery = pool.query;
  const queries = [];
  pool.query = async (...args) => { queries.push(args); return [[]]; };
  try {
    const existing = service.buildRow(proposal(), 5);
    const sheet = sheetMock([service.HEADER_ROW, existing]);
    await service.writeSheetRows(sheet, config, jobs, new Map([[1, proposal()]]), keys());
    assert.equal(sheet.calls[0].requestBody.data[1].range, "'ON stations'!A2:T2");
    assert.equal(sheet.calls[0].requestBody.data[1].values[0][0], 5);
    const insert = sheetMock([service.HEADER_ROW, [5, 'EMS-OTHER']]);
    await service.writeSheetRows(insert, config, jobs, new Map([[1, proposal()]]), keys());
    assert.equal(insert.calls[0].requestBody.data[1].range, "'ON stations'!A3:T3");
    assert.equal(insert.calls[0].requestBody.data[1].values[0][0], 6);
    const empty = sheetMock([]);
    await service.writeSheetRows(empty, config, jobs, new Map([[1, proposal()]]), keys());
    assert.deepEqual(empty.calls[0].requestBody.data.map(row => row.range), ["'ON stations'!A1:T1", "'ON stations'!A2:T2"]);
    const deletion = sheetMock([service.HEADER_ROW, existing]);
    await service.writeSheetRows(deletion, config, [{ ...jobs[0], operation: 'DELETE' }], new Map(), keys());
    assert.equal(deletion.calls[1].range, "'ON stations'!A2:T2");
    assert.equal(deletion.calls.length, 2);
    const broken = sheetMock([], new Error('Google read failed'));
    await assert.rejects(service.writeSheetRows(broken, config, jobs, new Map([[1, proposal()]]), new Map()), /Google read failed/);
    assert.deepEqual(broken.calls, []);
    assert.equal(queries.length, 4);
  } finally { pool.query = originalQuery; }
});

test('duplicate salesperson names in S do not affect matching by the proposal code in R', async (t) => {
  t.mock.method(pool, 'query', async () => [[]]);
  const first = service.buildRow(proposal(), 1);
  const second = service.buildRow(proposal({ ma_de_xuat_gen: 'OTHER_CODE' }), 2);
  first[18] = second[18] = 'Shared salesperson';
  const sheet = sheetMock([service.HEADER_ROW, first, second]);
  await service.writeSheetRows(sheet, config, jobs, new Map([[1, proposal()]]), keys());
  const update = sheet.calls[0].requestBody.data[1];
  assert.equal(update.range, "'ON stations'!A2:T2");
  assert.equal(update.values[0][17], 'LK_HNO_0001');
  assert.equal(update.values[0][18], 'Creator sales');
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
    assert.deepEqual((await service.loadProposalKeys([1])).get(1), { code: 'LK_HNO_0001', cms: '' });
    pool.query = async () => [[{ id: 1, proposal_code: 'DX1', code_count: 2 }]];
    await assert.rejects(service.loadProposalKeys([1]), /trùng trong DB/);
  } finally { pool.query = originalQuery; }
});

test('repeated reconciliation and deletion preserve U onward, including formulas and headers', async () => {
  const originalQuery = pool.query;
  const cells = [
    service.HEADER_ROW.concat('External header', 'External formula'),
    [...service.buildRow(proposal(), 1), 'External note', '=CUSTOM_FORMULA()']
  ];
  const apply = ({ range, values }) => {
    const match = range.match(/!A(\d+):T\d+$/);
    assert.ok(match, range);
    const index = Number(match[1]) - 1;
    cells[index] ||= [];
    for (let column = 0; column < values[0].length; column++) {
      if (values[0][column] !== null) cells[index][column] = values[0][column];
    }
  };
  const sheet = { spreadsheets: { values: {
    get: async request => {
      assert.equal(request.range, "'ON stations'!A1:T");
      return { data: { values: cells.map(row => row.slice(0, 20)) } };
    },
    batchUpdate: async request => { request.requestBody.data.forEach(apply); },
    clear: async request => apply({ ...request, values: [Array(20).fill('')] })
  } } };
  pool.query = async () => [[]];
  try {
    for (let index = 0; index < 2; index++) {
      await service.writeSheetRows(sheet, config, jobs, new Map([[1, proposal()]]), keys());
    }
    assert.equal(cells.length, 2);
    assert.equal(cells[1][20], 'External note');
    assert.equal(cells[1][21], '=CUSTOM_FORMULA()');
    assert.equal(cells[1][17], 'LK_HNO_0001');
    await service.writeSheetRows(sheet, config, [{ ...jobs[0], operation: 'DELETE' }], new Map(), keys());
    assert.equal(cells[1][20], 'External note');
    assert.equal(cells[1][21], '=CUSTOM_FORMULA()');
    assert.equal(cells[0][20], 'External header');
    assert.equal(cells[0][21], 'External formula');
    assert.ok(cells[1].slice(0, 20).every(value => value === ''));
    assert.equal(cells.length, 2);
  } finally { pool.query = originalQuery; }
});

test('load query joins both creator name and assigned account for personnel selection', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    assert.match(sql, /\$\.nguoi_phu_trach\.id/);
    assert.match(sql, /assignee\.full_name AS assignee_name/);
    assert.match(sql, /creator\.full_name AS creator_name/);
    assert.match(sql, /LEFT JOIN users creator ON creator.id = p.user_id/);
    assert.match(sql, /cs\.cms_station_code/);
    return [[]];
  };
  try { await service.loadProposals([1]); } finally { pool.query = originalQuery; }
});

test('worker exports a claimed job without an assignee but skips a job cancelled before claiming', async () => {
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
      if (sql.includes("SET status = 'PROCESSING'")) return [{ affectedRows: params[1] === 2 ? 1 : 0 }];
      return [[]];
    };
    pool.getConnection = async () => ({ query: pool.query, release: () => {} });
    assert.deepEqual(await service.processBatch(), { processed: 1, failed: 0 });
    assert.equal(sheet.calls[0].requestBody.data.length, 2);
    assert.equal(sheet.calls[0].requestBody.data[1].values[0][1], 'EMS002');
    assert.equal(updates.some(update => update.sql.includes("status = 'FAILED'")), false);
    assert.deepEqual(updates.filter(update => update.sql.includes("'DONE', 'PENDING'")).map(update => update.params[3]), [2]);
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

test('cancellation targets pending and failed jobs only and leaves their error history intact', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    assert.match(sql, /SET status = 'CANCELLED', next_attempt_at = NULL/);
    assert.match(sql, /WHERE status IN \('PENDING','FAILED'\)/);
    assert.doesNotMatch(sql, /last_error\s*=|attempt_count\s*=/);
    return [{ affectedRows: 65 }];
  });
  assert.deepEqual(await service.cancelQueuedJobs(), { cancelled: 65 });
});

test('R locates rows without CMS, clears stale E/F/S/T and preserves other missing cells', async (t) => {
  t.mock.method(pool, 'query', async () => [[]]);
  const existing = service.buildRow(proposal(), 9);
  existing[4] = 'Keep assigned person';
  existing[5] = 'Keep source';
  existing[18] = 'Old salesperson';
  existing[19] = 'Old source';
  existing[16] = 'External investor';
  const sheet = sheetMock([service.HEADER_ROW, existing]);
  const updated = proposal({
    cms_station_code: '', creator_name: null, assignee_name: null, creator_custom_data: {},
    latitude: 0, longitude: 0, chot_so_luong_tru: [],
  });
  await service.writeSheetRows(sheet, config, jobs, new Map([[1, updated]]),
    new Map([[1, { code: 'LK_HNO_0001', cms: '' }]]));
  const data = sheet.calls[0].requestBody.data[1];
  assert.equal(data.range, "'ON stations'!A2:T2");
  assert.equal(data.values[0][1], null);
  for (const index of [4, 5, 18, 19]) assert.equal(data.values[0][index], '');
  assert.equal(data.values[0][17], 'LK_HNO_0001');
  assert.equal(data.values[0][7], '0');
  assert.equal(data.values[0][16], null);
  assert.equal(data.values[0][14], 4);
});

test('new rows use R without CMS; missing keys never write and CMS or S never match existing rows', async (t) => {
  t.mock.method(pool, 'query', async () => [[]]);
  const sheet = sheetMock([service.HEADER_ROW]);
  await service.writeSheetRows(sheet, config, jobs,
    new Map([[1, proposal({ cms_station_code: '' })]]),
    new Map([[1, { code: 'LK_HNO_0001', cms: '' }]]));
  assert.equal(sheet.calls[0].requestBody.data[1].values[0][1], '');
  assert.equal(sheet.calls[0].requestBody.data[1].values[0][17], 'LK_HNO_0001');
  assert.equal(sheet.calls[0].requestBody.data[1].values[0][18], 'Creator sales');
  const noKey = sheetMock([service.HEADER_ROW]);
  await assert.rejects(service.writeSheetRows(noKey, config, jobs,
    new Map([[1, proposal({ ma_de_xuat_gen: '' })]]), new Map()), /thiếu mã BCĐX/);
  assert.deepEqual(noKey.calls, []);
  const first = service.buildRow(proposal({ ma_de_xuat_gen: 'OTHER_CODE' }), 1);
  first[18] = 'LK_HNO_0001';
  const second = service.buildRow(proposal({ ma_de_xuat_gen: '' }), 2);
  const duplicateCms = sheetMock([service.HEADER_ROW, first, second]);
  await service.writeSheetRows(duplicateCms, config, jobs, new Map([[1, proposal()]]), keys());
  const insert = duplicateCms.calls[0].requestBody.data[1];
  assert.equal(insert.range, "'ON stations'!A4:T4");
  assert.equal(insert.values[0][0], 3);
  assert.equal(insert.values[0][17], 'LK_HNO_0001');
  const deletion = sheetMock([service.HEADER_ROW, first, second]);
  await service.writeSheetRows(deletion, config, [{ ...jobs[0], operation: 'DELETE' }], new Map(), keys());
  assert.equal(deletion.calls.length, 1);
  assert.equal(deletion.calls[0].requestBody.data.length, 1);
});

test('wrong or missing R headers fail before Sheet writes or queue completion', async t => {
  const queries = [];
  t.mock.method(pool, 'query', async (...args) => { queries.push(args); return [[]]; });
  const oldHeader = [...service.HEADER_ROW];
  oldHeader[17] = '';
  oldHeader[18] = 'Mã BCĐX';
  for (const header of [oldHeader, ['STT', 'Mã Trạm']]) {
    const sheet = sheetMock([header, service.buildRow(proposal(), 1)]);
    await assert.rejects(service.writeSheetRows(sheet, config, jobs, new Map([[1, proposal()]]), keys()),
      /Header cột R/);
    assert.deepEqual(sheet.calls, []);
  }
  assert.deepEqual(queries, []);
});

test('Sheet write failures never mark jobs as synchronized', async t => {
  const queries = [];
  t.mock.method(pool, 'query', async (...args) => { queries.push(args); return [[]]; });
  const sheet = sheetMock([service.HEADER_ROW]);
  sheet.spreadsheets.values.batchUpdate = async () => { throw new Error('Google write failed'); };
  await assert.rejects(service.writeSheetRows(sheet, config, jobs, new Map([[1, proposal()]]), keys()),
    /Google write failed/);
  assert.deepEqual(queries, []);
});

test.after(async () => { await pool.end(); });
