const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const pool = require('../src/utils/db');
const service = require('../src/services/proposalSheetSyncService');

const config = { spreadsheetId: 'test', tabName: 'Đề xuất' };
const definitions = [
  { key: 'nguoi_phu_trach', label: 'Phụ trách', type: 'user' },
  { key: 'description', label: 'Mô tả', type: 'textarea' },
  { key: 'quy_hoach_note', label: 'Đánh giá QH', type: 'textarea' },
  { key: 'flag', label: 'Cờ', type: 'boolean' }
];
const fields = service.getExportFields(definitions);
const headers = service.buildColumns(fields).map((column) => column.header);
const record = (id, values = {}) => ({
  id, custom_data: {}, chot_so_luong_tru: [],
  ...values
});

const columnIndex = (name) => [...name].reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0) - 1;

const createSheet = (header, rows = []) => {
  const cells = [header.slice(), ...rows.map((row) => row.slice())];
  const calls = [];
  const setRange = (range, values) => {
    const match = /!([A-Z]+)(\d+)(?::([A-Z]+)\d+)?$/.exec(range);
    assert.ok(match, range);
    const start = columnIndex(match[1]);
    const rowIndex = Number(match[2]) - 1;
    for (let i = 0; i < values.length; i++) {
      cells[rowIndex + i] ||= [];
      values[i].forEach((value, offset) => { cells[rowIndex + i][start + offset] = value; });
    }
  };
  const sheets = { spreadsheets: { values: {
    get: async ({ range }) => {
      if (range.endsWith('!1:1')) return { data: { values: [cells[0]] } };
      if (range.endsWith('!A2:B')) return { data: { values: cells.slice(1).map((row) => row.slice(0, 2)) } };
      const match = /!([A-Z]+)2:([A-Z]+)$/.exec(range);
      assert.ok(match, range);
      return { data: { values: cells.slice(1).map((row) => row.slice(columnIndex(match[1]), columnIndex(match[2]) + 1)) } };
    },
    update: async ({ range, requestBody }) => { calls.push(['update', range]); setRange(range, requestBody.values); },
    batchUpdate: async ({ requestBody }) => {
      calls.push(['batchUpdate']);
      requestBody.data.forEach(({ range, values }) => setRange(range, values));
    },
    batchClear: async ({ requestBody }) => {
      calls.push(['batchClear']);
      requestBody.ranges.forEach((range) => {
        const match = /!([A-Z]+)(\d+)(?::([A-Z]+)\d+)?$/.exec(range);
        assert.ok(match, range);
        const start = columnIndex(match[1]);
        const end = match[3] ? columnIndex(match[3]) : start;
        const row = cells[Number(match[2]) - 1] || [];
        for (let i = start; i <= end; i++) row[i] = '';
      });
    },
    append: async ({ requestBody }) => { calls.push(['append']); cells.push(...requestBody.values.map((row) => row.slice())); }
  } } };
  return { sheets, cells, calls };
};

test('current header does not rewrite rows; safe append preserves external columns and rejects occupied cells', async () => {
  const current = createSheet([...headers, 'Ghi chú riêng'], [[1, 1, 'existing']]);
  await service.assertHeader(current.sheets, config, fields);
  assert.deepEqual(current.calls, []);

  const appended = createSheet(headers.slice(0, -1), [[1, 1]]);
  await service.assertHeader(appended.sheets, config, fields);
  assert.deepEqual(appended.cells[0], headers);
  assert.equal(appended.calls.length, 1);

  const occupied = createSheet(headers.slice(0, -1), [[1, 1, ...Array(headers.length - 3).fill(''), 'Dữ liệu riêng']]);
  await assert.rejects(service.assertHeader(occupied.sheets, config, fields), /đã có dữ liệu/);
  assert.deepEqual(occupied.calls, []);

  const legacy = createSheet(['ID đề xuất', 'Mã đề xuất'], [[1, 'old']]);
  await assert.rejects(service.assertHeader(legacy.sheets, config, fields), /Header Google Sheet không khớp/);
  assert.deepEqual(legacy.calls, []);
});

test('exports managers, fixed values, user names, empty amounts and boolean values correctly', () => {
  const proposal = record(1, {
    submitter_name: 'Nhân viên',
    parent_name: 'GĐKV', parent_chuc_vu: 'Giám đốc Khu vực',
    grandparent_name: 'GĐTT', grandparent_chuc_vu: 'Giám đốc Trung tâm Kinh doanh',
    description: 'Mô tả thật', quy_hoach_note: 'Đánh giá thật',
    custom_data: { nguoi_phu_trach: { id: 5 }, flag: false }
  });
  const values = service.mapProposalToRow(proposal, fields, 1, new Map([[5, { full_name: 'Người phụ trách' }]]), definitions);
  const byHeader = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  assert.equal(byHeader['GĐKV quản lý'], 'GĐKV');
  assert.equal(byHeader['Giám đốc TTKD'], 'GĐTT');
  assert.equal(byHeader['Phụ trách'], 'Người phụ trách');
  assert.equal(byHeader['Mô tả'], 'Mô tả thật');
  assert.equal(byHeader['Đánh giá QH'], 'Đánh giá thật');
  assert.equal(byHeader['Tổng chi phí'], '');
  assert.equal(byHeader['Tổng giá trị trụ chốt'], '');
  assert.equal(byHeader['Cờ'], 'Không');
  for (const [value, expected] of [[0, 'Không'], ['false', 'Không'], [true, 'Có'], [null, '']]) {
    const row = service.mapProposalToRow(record(1, { custom_data: { flag: value } }), fields, 1, new Map(), definitions);
    assert.equal(row[headers.indexOf('Cờ')], expected);
  }
  assert.throws(() => service.mapProposalToRow(record(1, { custom_data: { flag: 'invalid' } }), fields, 1, new Map(), definitions), /boolean không hợp lệ/);
});

test('exports independent proposed and committed pole counts by category', () => {
  const proposal = record(1, {
    custom_data: {
      mo_hinh_dau_tu: 'NQ_LK',
      loai_tru_nq: [
        { loai_tru: 'AC 22kW - Súng đơn', so_luong: 2 },
        { loai_tru: 'DC 30kW', so_luong: 1 },
        { loai_tru: 'GBT 60kW', so_luong: 3 }
      ],
      loai_tru_lk: [
        { loai_tru: { label: 'AC 22kW - có Auto Charge' }, so_luong: 1 },
        { loai_tru: 'DC 60kW', so_luong: 1 },
        { loai_tru: 'DC 400kW - Súng đôi dây 5m', so_luong: 2 }
      ]
    },
    chot_so_luong_tru: [
      { mo_hinh: 'LK', loai_tru: 'DC60', so_luong: 2 },
      { mo_hinh: 'NQ', loai_tru: 'DC 480kW', so_luong: 4 },
      { mo_hinh: 'NQ', loai_tru: 'DC 960kW', so_luong: 1 }
    ]
  });
  const columns = service.buildColumns(fields);
  const row = service.mapProposalToRow(proposal, fields, 1, new Map(), definitions);
  const values = Object.fromEntries(columns.map((column, index) => [column.key, row[index]]));
  assert.equal(columns[18].header, 'Quy mô trụ đề xuất');
  assert.equal(columns[31].header, 'Quy mô trụ chốt');
  assert.equal(values.__proposed_AC22, 3);
  assert.equal(values.__proposed_DC30, 1);
  assert.equal(values.__proposed_DC60, 1);
  assert.equal(values.__proposed_DC400, 2);
  assert.equal(values.__proposed_GBT60, 3);
  assert.equal(values.__proposed_DC480, 0);
  assert.equal(values.__committed_DC60, 2);
  assert.equal(values.__committed_GBT60, 0);
  assert.equal(values.__committed_DC480, 4);
  assert.equal(values.__committed_DC960, 1);
  assert.equal(typeof values.__proposed_DC60, 'number');
});

test('all twelve requested pole types are counted in both sections', () => {
  const poles = [
    ['AC7', 'AC 7kW'], ['AC22', 'AC22S'],
    ['DC20', 'DC 20kW'], ['DC30', 'DC 30kW'], ['DC60', 'DC 60kW'],
    ['DC120', 'DC 120kW'], ['DC240', 'DC 240kW'], ['DC320', 'DC 320kW'],
    ['DC400', 'DC400-5m'], ['DC480', 'DC 480kW'], ['DC960', 'DC 960kW'],
    ['GBT60', 'GBT 60kW']
  ];
  const rows = poles.map(([, label], index) => ({ loai_tru: label, so_luong: index + 1 }));
  const proposal = record(1, { custom_data: { mo_hinh_dau_tu: 'LK', loai_tru_lk: rows }, chot_so_luong_tru: rows });
  const columns = service.buildColumns(fields);
  const row = service.mapProposalToRow(proposal, fields, 1, new Map(), definitions);
  const values = Object.fromEntries(columns.map((column, index) => [column.key, row[index]]));
  assert.equal(columns.filter((column) => column.kind === 'poleCount').length, 24);
  poles.forEach(([code], index) => {
    assert.equal(values[`__proposed_${code}`], index + 1, code);
    assert.equal(values[`__committed_${code}`], index + 1, code);
  });
});

test('handles empty commitments, alternate and legacy pole rows without double counting', () => {
  const proposal = record(1, { custom_data: {
    mo_hinh_dau_tu: 'NQ_LK',
    loai_tru_nq: [],
    loai_tru_nq_cs: JSON.stringify({ rows: [{ ten_loai_tru: 'DC120', so_luong: 2 }] }),
    loai_tru_lk: [{ loai_tru: 'DC 120kW', so_luong: 3 }]
  } });
  const columns = service.buildColumns(fields);
  const byKey = (item) => {
    const row = service.mapProposalToRow(item, fields, 1, new Map(), definitions);
    return Object.fromEntries(columns.map((column, index) => [column.key, row[index]]));
  };
  const values = byKey(proposal);
  assert.equal(values.__proposed_DC120, 5);
  assert.equal(values.__committed_DC120, '');
  assert.match(values.__proposed_scale, /2 × DC120/);
  assert.equal(byKey(record(2, { custom_data: { loai_tru: 'GBT60', so_luong_tru: 1 } })).__proposed_GBT60, 1);
  assert.equal(byKey(record(3)).__proposed_DC60, '');
  const legacy = byKey(record(4, { custom_data: { loai_tru: '2 DC 60; 3 DC 120 + 1 GBT 60' } }));
  assert.equal(legacy.__proposed_DC60, 2);
  assert.equal(legacy.__proposed_DC120, 3);
  assert.equal(legacy.__proposed_GBT60, 1);
});

test('unknown pole types remain in scale text and emit a warning', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const proposal = record(4, { custom_data: {
    mo_hinh_dau_tu: 'LK', loai_tru_lk: [{ loai_tru: 'DC 600kW', so_luong: 2 }]
  } });
  const columns = service.buildColumns(fields);
  const row = service.mapProposalToRow(proposal, fields, 1, new Map(), definitions);
  const values = Object.fromEntries(columns.map((column, index) => [column.key, row[index]]));
  assert.match(values.__proposed_scale, /DC 600kW/);
  assert.equal(values.__proposed_DC60, 0);
  assert.equal(warn.mock.calls.length, 1);
  assert.match(warn.mock.calls[0].arguments[0], /1 loại trụ chưa nhận diện/);
});

test('missing quantities do not turn an incomplete category into a false total', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const proposal = record(5, { custom_data: {
    mo_hinh_dau_tu: 'LK',
    loai_tru_lk: [{ loai_tru: 'DC 60kW', so_luong: 2 }, { loai_tru: 'DC 60kW', so_luong: '' }]
  } });
  const columns = service.buildColumns(fields);
  const row = service.mapProposalToRow(proposal, fields, 1, new Map(), definitions);
  const values = Object.fromEntries(columns.map((column, index) => [column.key, row[index]]));
  assert.equal(values.__proposed_DC60, '');
  assert.equal(values.__proposed_DC30, 0);
  assert.match(values.__proposed_scale, /\? × DC 60kW/);
  assert.match(warn.mock.calls[0].arguments[0], /1 số lượng không hợp lệ/);
});

test('malformed pole tables are reported rather than silently treated as valid', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const proposal = record(6, {
    custom_data: { mo_hinh_dau_tu: 'LK', loai_tru_lk: '{invalid' },
    chot_so_luong_tru: { unexpected: true }
  });
  const columns = service.buildColumns(fields);
  const row = service.mapProposalToRow(proposal, fields, 1, new Map(), definitions);
  const values = Object.fromEntries(columns.map((column, index) => [column.key, row[index]]));
  assert.equal(values.__proposed_DC60, '');
  assert.equal(values.__committed_DC60, '');
  assert.equal(warn.mock.calls.length, 2);
  assert.match(warn.mock.calls[0].arguments[0], /bảng loai_tru_lk không hợp lệ/);
});

test('column migration is atomic, preserves external cells, and is idempotent', async () => {
  const previous = service.buildColumns(fields).filter((column) => column.kind !== 'poleCount').map((column) => column.header);
  const cells = [[...previous, 'Cột riêng'], [1, 42, ...Array(previous.length - 2).fill('data'), '=A2']];
  let writes = 0;
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: { title: config.tabName, sheetId: 7 }, merges: [] }] } }),
    values: { get: async () => ({ data: { values: [cells[0]] } }) },
    batchUpdate: async ({ requestBody }) => {
      writes++;
      for (const request of requestBody.requests) {
        if (request.insertDimension) {
          const { startIndex, endIndex } = request.insertDimension.range;
          cells.forEach((row) => row.splice(startIndex, 0, ...Array(endIndex - startIndex).fill('')));
        } else {
          const { startColumnIndex } = request.updateCells.range;
          request.updateCells.rows[0].values.forEach((value, i) => {
            cells[0][startColumnIndex + i] = value.userEnteredValue.stringValue;
          });
        }
      }
    }
  } };
  assert.deepEqual(await service.migratePoleColumns(sheets, config, fields), { status: 'ready', columnsPerGroup: 12 });
  assert.equal(writes, 0);
  assert.deepEqual(await service.migratePoleColumns(sheets, config, fields, { apply: true }), { status: 'migrated', columnsPerGroup: 12 });
  assert.deepEqual(cells[0].slice(0, headers.length), headers);
  assert.equal(cells[0][headers.length], 'Cột riêng');
  assert.equal(cells[1][headers.length], '=A2');
  assert.equal(cells[1][1], 42);
  assert.deepEqual(await service.migratePoleColumns(sheets, config, fields, { apply: true }), { status: 'already_migrated' });
  assert.equal(writes, 1);
});

test('column migration refuses unknown headers and merged ranges before writing', async () => {
  const previous = service.buildColumns(fields).filter((column) => column.kind !== 'poleCount').map((column) => column.header);
  let header = ['Unexpected'];
  let merges = [];
  let writes = 0;
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: { title: config.tabName, sheetId: 7 }, merges }] } }),
    values: { get: async () => ({ data: { values: [header] } }) },
    batchUpdate: async () => { writes++; }
  } };
  await assert.rejects(service.migratePoleColumns(sheets, config, fields, { apply: true }), /không khớp cấu trúc cũ/);
  header = previous;
  merges = [{ startColumnIndex: 18, endColumnIndex: 21 }];
  await assert.rejects(service.migratePoleColumns(sheets, config, fields, { apply: true }), /ô gộp/);
  assert.equal(writes, 0);
});

test('migration CLI refuses apply without backup and worker-stop confirmations', () => {
  const script = path.resolve(__dirname, '../scripts/migrate-proposal-sheet-poles.js');
  const result = spawnSync(process.execPath, [script, '--apply'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /confirm-backup --confirm-workers-stopped/);
});

test('deleting and appending compacts only live serials, retaining external columns', async () => {
  const oldRow = service.mapProposalToRow(record(1), fields, 1, new Map(), definitions);
  const liveRow = service.mapProposalToRow(record(2), fields, 2, new Map(), definitions);
  const sheet = createSheet([...headers, 'Ghi chú riêng'], [
    [...oldRow, 'Ghi chú đã xóa'], [...liveRow, 'Ghi chú còn lại']
  ]);
  await service.writeSheetRows(sheet.sheets, config,
    [{ proposal_id: 1, operation: 'DELETE' }, { proposal_id: 3, operation: 'UPSERT' }],
    new Map([[3, record(3, { custom_data: { nguoi_phu_trach: { id: 5 } } })]]),
    fields, definitions, new Map([[5, { full_name: 'Tên mới' }]]));
  assert.equal(sheet.cells[1][0], '');
  assert.equal(sheet.cells[1][1], '');
  assert.equal(sheet.cells[1][headers.length], 'Ghi chú đã xóa');
  assert.equal(sheet.cells[2][0], 1);
  assert.equal(sheet.cells[2][headers.length], 'Ghi chú còn lại');
  assert.equal(sheet.cells[3][0], 2);
  assert.equal(sheet.cells[3][headers.indexOf('Phụ trách')], 'Tên mới');
});

test('cleans orphan serial without treating it as a proposal and rejects duplicate IDs', async () => {
  const sheet = createSheet(headers, [[1], [2, 5]]);
  await service.writeSheetRows(sheet.sheets, config, [{ proposal_id: 5, operation: 'UPSERT' }],
    new Map([[5, record(5)]]), fields, definitions);
  assert.equal(sheet.cells[1][0], '');
  assert.equal(sheet.cells[2][0], 1);

  const duplicates = createSheet(headers, [[1, 5], [2, 5]]);
  await assert.rejects(service.writeSheetRows(duplicates.sheets, config, [], new Map(), fields, definitions), /bị trùng/);
  assert.deepEqual(duplicates.calls, []);
});

test('loads fixed fields and exposes the latest queue error in status', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.includes('FROM station_proposals p')) {
      assert.match(sql, /SELECT p\.\*/);
      return [[record(1, { description: 'Mô tả thật' })]];
    }
    if (sql.includes('FROM proposal_sheet_sync_runs')) return [[]];
    if (sql.includes('SUM(status')) return [[{ pending_count: 1, failed_count: 1 }]];
    if (sql.includes('SELECT last_error')) return [[{ last_error: 'Header không khớp' }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  assert.equal((await service.loadProposals([1]))[0].description, 'Mô tả thật');
  const status = await service.getStatus();
  assert.equal(status.pendingCount, 1);
  assert.equal(status.failedCount, 1);
  assert.equal(status.lastError, 'Header không khớp');
});

test('does not process a job whose version changed before it was claimed', async (t) => {
  const saved = {
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    PROPOSAL_GOOGLE_SHEETS_SPREADSHEET_ID: process.env.PROPOSAL_GOOGLE_SHEETS_SPREADSHEET_ID,
    PROPOSAL_GOOGLE_SHEETS_TAB_NAME: process.env.PROPOSAL_GOOGLE_SHEETS_TAB_NAME
  };
  process.env.GOOGLE_APPLICATION_CREDENTIALS = __filename;
  process.env.PROPOSAL_GOOGLE_SHEETS_SPREADSHEET_ID = 'fixture';
  process.env.PROPOSAL_GOOGLE_SHEETS_TAB_NAME = 'fixture';
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  let released = false;
  t.mock.method(pool, 'getConnection', async () => ({
    query: async (sql) => sql.includes('GET_LOCK') ? [[{ acquired: 1 }]] : [[]],
    release: () => { released = true; }
  }));
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.includes("updated_at < DATE_SUB")) return [{ affectedRows: 0 }];
    if (sql.includes('SELECT proposal_id, operation')) {
      return [[{ proposal_id: 1, operation: 'UPSERT', requested_version: 1, attempt_count: 0 }]];
    }
    if (sql.includes("SET status = 'PROCESSING'")) return [{ affectedRows: 0 }];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  assert.deepEqual(await service.processBatch(), { processed: 0 });
  assert.equal(released, true);
});
