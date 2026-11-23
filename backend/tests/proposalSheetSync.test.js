const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const pool = require('../src/utils/db');
const service = require('../src/services/proposalSheetSyncService');
const { backfill } = require('../scripts/backfill-proposal-status-changed-at');

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

test('proposal submitter column prefers the selected user and falls back to the creator', () => {
  const users = new Map([[42, { id: 42, full_name: 'Người được chọn' }]]);
  const map = (customData, tab = 'Data_QT1') => {
    const row = service.mapProposalToRow(record(1, {
      submitter_name: 'Admin', custom_data: customData
    }), fields, 1, users, definitions, tab);
    return row[service.buildColumns(fields, tab).findIndex(column => column.key === '__submitter_name')];
  };
  assert.equal(map({ nguoi_de_xuat: { id: 42 } }), 'Người được chọn');
  assert.equal(map({ nguoi_de_xuat: 42 }, 'Đề xuất'), 'Người được chọn');
  assert.equal(map({ nguoi_de_xuat: 'Tên cũ' }), 'Tên cũ');
  assert.equal(map({ nguoi_de_xuat: null }), 'Admin');
  assert.throws(() => map({ nguoi_de_xuat: { id: 99 } }), /không tìm thấy người đề xuất #99/);
});

test('worker loads the selected proposer even when it is not an export field', async (t) => {
  const { google } = require('googleapis');
  const env = {
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    PROPOSAL_GOOGLE_SHEETS_SPREADSHEET_ID: process.env.PROPOSAL_GOOGLE_SHEETS_SPREADSHEET_ID,
    PROPOSAL_GOOGLE_SHEETS_TAB_NAME: process.env.PROPOSAL_GOOGLE_SHEETS_TAB_NAME
  };
  process.env.GOOGLE_APPLICATION_CREDENTIALS = __filename;
  process.env.PROPOSAL_GOOGLE_SHEETS_SPREADSHEET_ID = 'fixture';
  process.env.PROPOSAL_GOOGLE_SHEETS_TAB_NAME = 'fixture';
  t.after(() => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    require('../src/utils/ttlCache').del('fielddefs:all:station_proposals');
  });
  const sheet = createSheet(service.buildColumns([], 'fixture').map(column => column.header));
  t.mock.method(google.auth.GoogleAuth.prototype, 'getClient', async () => ({}));
  t.mock.method(google, 'sheets', () => sheet.sheets);
  t.mock.method(pool, 'getConnection', async () => ({
    query: async sql => sql.includes('GET_LOCK') ? [[{ acquired: 1 }]] : [[]],
    release: () => {}
  }));
  let fetchedIds;
  t.mock.method(pool, 'query', async (sql, params) => {
    if (sql.includes("updated_at < DATE_SUB")) return [{ affectedRows: 0 }];
    if (sql.includes('SELECT proposal_id, operation')) return [[{ proposal_id: 1, operation: 'UPSERT', requested_version: 1 }]];
    if (sql.includes("SET status = 'PROCESSING'")) return [{ affectedRows: 1 }];
    if (sql.includes('FROM station_proposals p')) return [[record(1, {
      submitter_name: 'Admin', custom_data: { nguoi_de_xuat: { id: 42 } }
    })]];
    if (sql.includes('FROM field_definitions')) return [[]];
    if (sql.includes('FROM users WHERE id IN')) {
      fetchedIds = params;
      return [[{ id: 42, full_name: 'Người được chọn' }]];
    }
    if (sql.includes('SET synced_version')) return [{ affectedRows: 1 }];
    if (sql.includes('SELECT DISTINCT manual_run_id')) return [[]];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  assert.deepEqual(await service.processBatch(), { processed: 1 });
  assert.deepEqual(fetchedIds, [42]);
  assert.equal(sheet.cells[1][4], 'Người được chọn');
});

test('Data_QT1 validates the requested headers and preserves columns after the managed range', async () => {
  const qtConfig = { ...config, tabName: 'Data_QT1' };
  const requested = [
    'STT|ID đề xuất|Mã đề xuất|Ngày tạo|Người đề xuất|GĐKV quản lý|Phòng ban|Giám đốc TTKD|Pháp nhân / Chủ trạm|SĐT liên hệ|Mô hình đầu tư|Địa chỉ|Vĩ độ|Kinh độ|Phường/Xã|Tỉnh/Thành phố|Miền|Loại đất|Diện tích mặt bằng|Quy mô trụ đề xuất',
    'ĐX_AC 7 kW|ĐX_AC 22 kW|ĐX_DC 20 kW|ĐX_DC 30 kW|ĐX_DC 60 kW|ĐX_DC 120 kW|ĐX_DC 240 kW|ĐX_DC 320 kW|ĐX_DC 400 kW|ĐX_DC 480 kW|ĐX_DC 960 kW|ĐX_GBT 60 kW',
    'Quy mô trụ chốt|AC 7 kW|AC 22 kW|DC 20 kW|DC 30 kW|DC 60 kW|DC 120 kW|DC 240 kW|DC 320 kW|DC 400 kW|DC 480 kW|DC 960 kW|GBT 60 kW',
    'Tổng chi phí|Tổng giá trị trụ chốt|Trạng thái đề xuất|Thời gian cập nhật trạng thái|Mức độ xem xét|Trạng thái Quy hoạch|Trạng thái Pháp lý|Ghi chú trạng thái|Ngày dự kiến ON|Ngày ON thực tế|Trạng thái hợp đồng|Trạng thái hạ tầng điện|Trạng thái hạ tầng mặt bằng|Trạng thái tài chính|Phần trăm đã thanh toán|Ngày cập nhật|Google Maps',
    'Diện tích (dạng chữ)|Mô tả|Mã tỉnh|Pháp lý đất|Ghi chú|Tổng cộng chi phí|Địa chỉ ĐKKD|SĐT CĐT|Giá niêm yết|Giá ưu đãi|Tên khách hàng|MST|Số tài khoản|Kiểm tra quy hoạch|Loại ưu tiên|Tên ngân hàng|Chính sách Nhượng quyền',
    'Chi phí vận chuyển|Chi phí trạm biến áp|Chi phí hạ tầng|Chi phí thuê vị trí|Đặt cọc|Ghi chú về khoản cọc|Ảnh toàn mặt bằng|Video mặt bằng (nếu có)|Người liên hệ|Hợp đồng thuê đất (Nếu có)|Quan hệ với mặt bằng|Thời hạn sử dụng/thuê|Độ rộng lối ra, vào (m)|Phân loại khách hàng',
    'Ghi chú về hồ sơ pháp lý|Ghi chú về Quy hoạch|Ghi chú về Tài chính|Nhóm mặt bằng|Ảnh vị trí dự kiến lắp đặt trụ sạc|Chính sách Liên kết|CCCD người đại diện|Bản vẽ tay|Chiều rộng mặt tiền(m)|Bề rộng lòng đường phía trc lô đất(m)|Điện ba pha|Trạm biến áp|Công suất khả dụng của trạm biến áp để làm trạm sạc (kW).|Email|Quy hoạch đánh giá|Pháp lý đánh giá'
  ].join('|').split('|');
  const sheet = createSheet([...requested, 'Cột riêng'], [
    [1, '1', ...Array(requested.length - 2).fill(''), 'Giữ nguyên khi cập nhật'],
    [2, '2', ...Array(requested.length - 2).fill('Dữ liệu cũ'), 'Giữ nguyên khi xóa']
  ]);
  const old = createSheet(requested.map((title) => title.replace(/^ĐX_/, '')));
  await assert.rejects(service.assertHeader(old.sheets, qtConfig, fields), /Header Google Sheet không khớp/);
  assert.deepEqual(old.calls, []);
  await service.assertHeader(sheet.sheets, qtConfig, fields);
  assert.deepEqual(sheet.calls, []);

  const proposals = new Map([
    [1, record(1, {
      area: '200 m²', description: 'Mô tả thử', quy_hoach_note: 'QH thử', phap_ly_note: 'PL thử',
      ngay_du_kien_on: '2026-02-01', actual_on_date: '2026-02-03',
      custom_data: { ma_tinh: 'TEST', ghi_chu: 'Ghi chú thử', mo_hinh_dau_tu: 'NQ',
        loai_tru_nq: [{ loai_tru: 'AC 7 kW', so_luong: 2 }] },
      chot_so_luong_tru: [{ loai_tru: 'AC 7 kW', so_luong: 1 }]
    })],
    [3, record(3, { actual_on_date: '2026-12-31' })]
  ]);
  await service.writeSheetRows(sheet.sheets, qtConfig, [
    { proposal_id: 1, operation: 'UPSERT' }, { proposal_id: 2, operation: 'DELETE' },
    { proposal_id: 3, operation: 'UPSERT' }
  ], proposals, fields, definitions);
  const at = (col) => sheet.cells[1][columnIndex(col)];
  assert.deepEqual([at('U'), at('AH'), at('BK'), at('BL'), at('BM'), at('BO'), at('DD'), at('DE'), at('DF')],
    [2, 1, '200 m²', 'Mô tả thử', 'TEST', 'Ghi chú thử', 'QH thử', 'PL thử', 'Giữ nguyên khi cập nhật']);
  assert.equal(at('BB'), '01/02/2026');
  assert.equal(at('BC'), '02/03/2026');
  assert.ok(sheet.cells[2].slice(0, requested.length).every((value) => value === ''));
  assert.equal(sheet.cells[2][requested.length], 'Giữ nguyên khi xóa');
  assert.equal(sheet.cells[3].length, requested.length);
  assert.equal(sheet.cells[3][1], '3');
  assert.equal(sheet.cells[3][columnIndex('BC')], '12/31/2026');
});

test('Data_QT1 maps ON status and numeric percentage using existing finance rules', () => {
  const columns = service.buildColumns(fields, 'Data_QT1');
  const map = (extra) => {
    const row = service.mapProposalToRow(record(1, extra), fields, 1, new Map(), definitions, 'Data_QT1');
    return Object.fromEntries(columns.map((column, index) => [column.key, row[index]]));
  };
  const on = {
    on_station_id: 4, contract_status: 'DONE', infra_power_status: 'DONE', infra_site_status: 'DOING',
    deposit_status: 'RECEIVED', payment_status: 'DOING', deposit_refund_required: 0,
    tong_gia_tri_chot: '100.00', deposit_total: '30.00', payment_total: '65.00', refund_total: '5.00',
    custom_data: { mo_hinh_dau_tu: 'NQ' }
  };
  const result = map(on);
  assert.deepEqual(
    [result.__on_contract, result.__on_power, result.__on_site, result.__on_finance, result.__on_paid_percent],
    ['Đã ký hợp đồng', 'Đã làm', 'Đang làm', 'Đang thanh toán', 0.9]
  );
  assert.equal(map({ ...on, payment_total: 250 }).__on_paid_percent, 1);
  assert.equal(map({ ...on, payment_total: 64.99 }).__on_paid_percent, 0.9);
  assert.equal(map({ ...on, payment_total: 0, refund_total: 50 }).__on_paid_percent, 0);
  assert.equal(map({ ...on, tong_gia_tri_chot: 0 }).__on_paid_percent, 0);
  assert.equal(map({ ...on, payment_total: 75 }).__on_finance, 'Đã thanh toán toàn bộ');
  assert.equal(map({ ...on, tong_gia_tri_chot: 0, payment_status: 'DONE' }).__on_finance, 'Đã thanh toán toàn bộ');
  assert.equal(map({ ...on, contract_status: null }).__on_contract, '—');
  const tdt = map({ ...on, custom_data: { mo_hinh_dau_tu: 'TDT' } });
  assert.equal(tdt.__on_paid_percent, '');
  assert.equal(tdt.__on_finance, 'Không yêu cầu');
  const absent = map({});
  assert.deepEqual(ON_KEYS.map((key) => absent[key]), ['', '', '', '', '']);
  assert.throws(() => map({ ...on, contract_status: 'UNKNOWN' }), /trạng thái hợp đồng không hợp lệ/);
});

const ON_KEYS = ['__on_contract', '__on_power', '__on_site', '__on_finance', '__on_paid_percent'];

test('prepared empty ON columns receive headers only when all new cells are empty', async () => {
  const qtConfig = { ...config, tabName: 'Data_QT1' };
  const requested = service.buildColumns(fields, qtConfig.tabName).map(column => column.header);
  const prepared = requested.slice();
  prepared.splice(columnIndex('BD'), 5, '', '', '', '', '');
  const sheet = createSheet(prepared, [[1, '1']]);
  await service.assertHeader(sheet.sheets, qtConfig, fields);
  assert.deepEqual(sheet.cells[0], requested);
  assert.deepEqual(sheet.calls, [['update', "'Data_QT1'!BD1:BH1"]]);
  const row = Array(requested.length).fill('');
  row[columnIndex('BH')] = '=1+1';
  const occupied = createSheet(prepared, [row]);
  await assert.rejects(service.assertHeader(occupied.sheets, qtConfig, fields), /các cột mới đã có dữ liệu/);
  assert.deepEqual(occupied.calls, []);
  const incorrect = prepared.slice();
  incorrect[columnIndex('BI')] = 'Sai cột';
  const mismatched = createSheet(incorrect);
  await assert.rejects(service.assertHeader(mismatched.sheets, qtConfig, fields), /Header Google Sheet không khớp/);
  assert.deepEqual(mismatched.calls, []);
});

test('Data_QT1 formats only its percentage data column as a percentage', async () => {
  const calls = [];
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: { title: 'Data_QT1', sheetId: 7 } }] } }),
    batchUpdate: async (request) => calls.push(request)
  } };
  await service.ensurePaidPercentFormat(sheets, { ...config, tabName: 'Data_QT1' }, fields);
  assert.deepEqual(calls[0].requestBody.requests[0].repeatCell, {
    range: { sheetId: 7, startRowIndex: 1, startColumnIndex: columnIndex('BH'), endColumnIndex: columnIndex('BI') },
    cell: { userEnteredFormat: { numberFormat: { type: 'PERCENT', pattern: '0%' } } },
    fields: 'userEnteredFormat.numberFormat'
  });
  await service.ensurePaidPercentFormat(sheets, config, fields);
  assert.equal(calls.length, 1);
});

test('TEST_Data_QT1 uses the same fixed columns and log query as Data_QT1', async t => {
  assert.deepEqual(service.buildColumns(fields, 'TEST_Data_QT1'), service.buildColumns(fields, 'Data_QT1'));
  let query;
  t.mock.method(pool, 'query', async sql => {
    query = sql;
    return [[]];
  });
  await service.loadProposals([1], 'TEST_Data_QT1');
  assert.match(query, /JOIN proposal_activity_logs status_log/);
  assert.match(query, /ORDER BY l\.created_at DESC, l\.id DESC LIMIT 1/);
});

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

test('fills only an empty status-time header in the already prepared layout', async () => {
  const index = headers.indexOf('Thời gian cập nhật trạng thái');
  const prepared = headers.slice();
  prepared[index] = '';
  const sheet = createSheet([...prepared, 'Ghi chú riêng'], [[1, 1]]);
  await service.assertHeader(sheet.sheets, config, fields);
  assert.deepEqual(sheet.calls, [['update', "'Đề xuất'!AW1"]]);
  assert.deepEqual(sheet.cells[0], [...headers, 'Ghi chú riêng']);

  const occupiedRow = Array(headers.length).fill('');
  occupiedRow[index] = 'Dữ liệu riêng';
  const occupied = createSheet(prepared, [occupiedRow]);
  await assert.rejects(service.assertHeader(occupied.sheets, config, fields), /cột đã có dữ liệu/);
  assert.deepEqual(occupied.calls, []);
});

test('exports the selected GĐKV department and independent status and actual ON dates', () => {
  const columns = service.buildColumns([]);
  const proposal = record(1, {
    submitter_name: 'CTV', parent_name: 'GĐKV', parent_chuc_vu: 'Giám đốc Khu vực',
    parent_department: 'Phòng Bắc', grandparent_name: 'GĐTT',
    grandparent_chuc_vu: 'Giám đốc Trung tâm Kinh doanh', grandparent_department: 'Phòng khác',
    status_changed_at: new Date('2026-01-02T03:04:00Z'),
    ngay_du_kien_on: '2026-02-01', actual_on_date: '2026-02-03'
  });
  const row = service.mapProposalToRow(proposal, [], 1);
  assert.equal(columns[6].key, '__area_department');
  assert.equal(columns[47].key, '__proposal_status');
  assert.equal(columns[48].key, '__status_changed_at');
  assert.equal(columns[53].key, '__expected_on_date');
  assert.equal(columns[54].key, '__actual_on_date');
  assert.equal(row[6], 'Phòng Bắc');
  assert.equal(row[48], '02/01/2026 10:04');
  assert.equal(row[53], '01/02/2026');
  assert.equal(row[54], '02/03/2026');
  const dateObject = service.mapProposalToRow(record(3, {
    actual_on_date: new Date('2026-02-02T17:00:00Z')
  }), [], 1);
  assert.equal(dateObject[54], '02/03/2026');
  const noManager = service.mapProposalToRow(record(2, { actual_on_date: null }), [], 1);
  assert.equal(noManager[6], '');
  assert.equal(noManager[48], '');
  assert.equal(noManager[54], '');
});

test('Data_QT1 loads latest status-change log by proposal and falls back only when no log exists', async t => {
  const calls = [];
  t.mock.method(pool, 'query', async (sql, params) => {
    calls.push({ sql, params });
    return [[record(1, { status_log_id: 7, status_changed_at: new Date('2026-01-02T03:04:00Z') })]];
  });
  const rows = await service.loadProposals([1, 2], 'Data_QT1');
  assert.match(calls[0].sql, /l\.action = 'status_change'/);
  assert.match(calls[0].sql, /NOT \(l\.from_status <=> l\.to_status\)/);
  assert.match(calls[0].sql, /ORDER BY l\.created_at DESC, l\.id DESC LIMIT 1/);
  assert.match(calls[0].sql, /CASE WHEN status_log\.id IS NULL THEN pst\.changed_at ELSE status_log\.created_at END/);
  assert.deepEqual(calls[0].params, [1, 2]);
  assert.equal(service.mapProposalToRow(rows[0], fields, 1, new Map(), definitions, 'Data_QT1')[48], '02/01/2026 10:04');
  await service.loadProposals([1], 'Đề xuất');
  assert.doesNotMatch(calls[1].sql, /JOIN proposal_activity_logs/);
  assert.equal((await service.loadProposals([], 'Data_QT1')).length, 0);
});

test('a status log with a missing timestamp fails the batch instead of using a fallback', async t => {
  t.mock.method(pool, 'query', async () => [[record(1, { status_log_id: 8, status_changed_at: null })]]);
  await assert.rejects(service.loadProposals([1], 'Data_QT1'), /nhật ký đổi trạng thái không có thời gian/);
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
  assert.equal(columns[19].header, 'Quy mô trụ đề xuất');
  assert.equal(columns[32].header, 'Quy mô trụ chốt');
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

test('pole migration still recognizes layouts predating the three new columns', async () => {
  const legacy = service.buildColumns(fields)
    .filter((column) => !['areaDepartment', 'statusChangedAt', 'actualOnDate'].includes(column.kind));
  let header = legacy.filter((column) => column.kind !== 'poleCount').map((column) => column.header);
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: { title: config.tabName, sheetId: 7 }, merges: [] }] } }),
    values: { get: async () => ({ data: { values: [header] } }) }
  } };
  assert.deepEqual(await service.migratePoleColumns(sheets, config, fields), { status: 'ready', columnsPerGroup: 12 });
  header = legacy.map((column) => column.header);
  assert.deepEqual(await service.migratePoleColumns(sheets, config, fields), { status: 'already_migrated' });
});

test('migration CLI refuses apply without backup and worker-stop confirmations', () => {
  const script = path.resolve(__dirname, '../scripts/migrate-proposal-sheet-poles.js');
  const result = spawnSync(process.execPath, [script, '--apply'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /confirm-backup --confirm-workers-stopped/);
  const backfillScript = path.resolve(__dirname, '../scripts/backfill-proposal-status-changed-at.js');
  const backfillResult = spawnSync(process.execPath, [backfillScript, '--apply'], { encoding: 'utf8' });
  assert.equal(backfillResult.status, 1);
  assert.match(backfillResult.stderr, /confirm-backup --confirm-workers-stopped/);
});

test('status backfill skips missing or mismatched logs and queues only successful inserts', async () => {
  const rows = [
    { id: 1, status: 'ACTIVE', log_id: 8, to_status: 'ACTIVE', log_created_at: '2026-01-01' },
    { id: 2, status: 'PENDING', log_id: null, to_status: null },
    { id: 3, status: 'ACTIVE', log_id: 9, to_status: 'PENDING', log_created_at: '2026-01-01' },
    { id: 4, status: 'ACTIVE', log_id: 10, to_status: 'ACTIVE', log_created_at: '2026-01-01' }
  ];
  const calls = [];
  const connection = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('LEFT JOIN proposal_status_change_times')) return [params[0] === 0 ? rows : []];
      if (sql.includes('INSERT INTO proposal_status_change_times')) {
        return [{ affectedRows: params[1] === 1 ? 1 : 0 }];
      }
      if (sql.includes('INSERT INTO proposal_sheet_sync_queue')) return [{ affectedRows: 1 }];
      throw new Error('Unexpected query');
    },
    beginTransaction: async () => calls.push({ action: 'begin' }),
    commit: async () => calls.push({ action: 'commit' }),
    rollback: async () => calls.push({ action: 'rollback' })
  };
  assert.deepEqual(await backfill(connection, false),
    { eligible: 2, missing: 1, mismatch: 1, updated: 0, concurrent: 0 });
  assert.equal(calls.filter((call) => call.action === 'begin').length, 0);
  calls.length = 0;
  assert.deepEqual(await backfill(connection, true),
    { eligible: 2, missing: 1, mismatch: 1, updated: 1, concurrent: 1 });
  assert.equal(calls.filter((call) => call.sql?.includes('INSERT INTO proposal_sheet_sync_queue')).length, 1);
  assert.equal(calls.filter((call) => call.action === 'commit').length, 2);
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
