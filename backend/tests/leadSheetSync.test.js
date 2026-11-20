const test = require('node:test');
const assert = require('node:assert/strict');
const { HEADERS, getStatus, startRun, mapLeadToRow, writeRows } = require('../src/services/leadSheetSyncService');

const sheetHeaders = 'Mã khách hàng|Họ và tên|Số điện thoại|Email|Địa chỉ|Phường/Xã|Tỉnh/Thành phố|Vùng miền|Nguồn Lead|Ghi chú chung|Giai đoạn|Phân loại khách hàng|Trạng thái tư vấn|Kết quả TVBH|Ngày tạo|Ngày cập nhật|ID người phụ trách|Người phụ trách|Chức vụ|Phòng ban hiện tại|Phòng ban được phân chia|Thời điểm phân chia|Ghi chú TVBH|GĐKV phân loại KH|Thời gian GĐKV phân loại KH|Ghi chú GĐKV phân loại KH|Thời gian gọi lần đầu|Thời gian chốt kết quả cuối cùng|Lịch sử tư vấn'.split('|');

const lead = {
  lead_code: 'LD-000001', full_name: 'Khách kiểm thử', phone: '0123456789', note: '=1+2',
  assigned_user_id: 7, assignee_name: 'Người phụ trách thử', assigned_department: 'Phòng phân chia',
  assignee_data: '{"chuc_vu":"GĐKV","department":"Phòng hiện tại"}',
  consultation_status: 'CONSULTING',
  custom_data: {
    cskh_history: [{ thoi_gian: '2026-11-19T14:30', tinh_trang: 'PENDING', ghi_chu: 'Gọi lại\nNgày mai -- buổi sáng' }],
    tvbh_history: [{ thoi_gian: '2026-11-18T02:15:00Z', tinh_trang: 'Đã tư vấn', ghi_chu: 'Đã trao đổi' }]
  }
};

function fakeSheets(rows, columnCount = 29) {
  const writes = [];
  const state = structuredClone(rows);
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: {
      sheetId: 7, title: 'QL_khach_hang', sheetType: 'GRID', gridProperties: { rowCount: 100, columnCount }
    } }] } }),
    batchUpdate: async (request) => {
      writes.push(request);
      for (const { appendDimension } of request.requestBody.requests) {
        if (appendDimension?.dimension === 'COLUMNS') columnCount += appendDimension.length;
      }
    },
    values: {
      get: async ({ range, valueRenderOption }) => {
        assert.equal(range, "'QL_khach_hang'");
        assert.equal(valueRenderOption, 'FORMULA');
        return { data: { values: structuredClone(state) } };
      },
      batchUpdate: async (request) => {
        writes.push(request);
        assert.equal(request.requestBody.valueInputOption, 'RAW');
        for (const { range, values: [values] } of request.requestBody.data) {
          const [, row] = /^'QL_khach_hang'!A(\d+):AC\1$/.exec(range);
          assert.equal(values.length, 29);
          state[row - 1] = [...values, ...(state[row - 1]?.slice(29) || [])];
        }
      }
    }
  } };
  return { sheets, writes, state };
}

test('joins both history tables into one cell in chronological order and separates department fields', () => {
  const row = mapLeadToRow(lead, (key, value) => key === 'cskh_history' && value === 'PENDING' ? 'Chờ liên hệ' : value);
  assert.equal(row[2], '0123456789');
  assert.equal(row[12], 'GĐKV đang tư vấn');
  assert.deepEqual(row.slice(16, 21), ['7', 'Người phụ trách thử', 'GĐKV', 'Phòng hiện tại', 'Phòng phân chia']);
  assert.equal(row[28], [
    '1. TVBH -- 18/11/2026 09:15 -- Đã tư vấn -- Đã trao đổi',
    '2. CSKH -- 19/11/2026 14:30 -- Chờ liên hệ -- Gọi lại ↵ Ngày mai — buổi sáng'
  ].join('\n'));
});

test('initializes, writes literal text, updates by code without duplication, and clears only managed cells', async () => {
  const { sheets, state, writes } = fakeSheets([], 27);
  const row = mapLeadToRow(lead);
  await writeRows(sheets, 'fixture', [{ code: lead.lead_code, values: row }]);
  assert.deepEqual(state[0], sheetHeaders);
  assert.equal(writes[0].requestBody.requests[0].appendDimension.length, 2);
  assert.deepEqual(writes[0].requestBody.requests[1].repeatCell.range,
    { sheetId: 7, startColumnIndex: 28, endColumnIndex: 29 });
  assert.equal(writes[0].requestBody.requests[1].repeatCell.cell.userEnteredFormat.wrapStrategy, 'WRAP');
  state[1][29] = '=1+2';
  await writeRows(sheets, 'fixture', [{ code: lead.lead_code, values: mapLeadToRow({ ...lead, full_name: 'Tên mới' }) }]);
  assert.equal(writes.length, 3);
  assert.equal(state.length, 2);
  assert.equal(state[1][1], 'Tên mới');
  assert.equal(state[1][9], '=1+2');
  await writeRows(sheets, 'fixture', [{ code: lead.lead_code, values: null }]);
  assert.deepEqual(state[1].slice(0, 29), Array(29).fill(''));
  assert.equal(state[1][29], '=1+2');
});

test('exports MySQL Date values for creation and last update in columns O and P', () => {
  const row = mapLeadToRow({
    ...lead, created_at: new Date('2026-11-20T01:05:00Z'), updated_at: new Date('2026-11-20T18:45:00Z')
  });
  assert.deepEqual(row.slice(14, 16), ['20/11/2026 08:05', '21/11/2026 01:45']);
});

test('exports one latest valid consultation and independent milestone dates', () => {
  const row = mapLeadToRow({
    ...lead, created_at: '2026-11-16T08:00', assigned_at: '2026-11-20T14:00',
    source: 'Web', customer_type: 'Không xuất', center_to_area_assigned_at: '2026-11-18T09:00',
    first_contact_at: '2026-11-18T10:00',
    first_consultation_created_at: new Date('2026-11-19T02:25:00Z'),
    sales_outcome_at: '2026-11-20T01:00Z', custom_data: { cskh_note: 'Không xuất', tvbh_note: 'Ghi chú TVBH', tvbh_history: [
      { thoi_gian: '2026-11-19T13:00', GDKV_phan_loai_KH: 'a', ghi_chu: 'Ghi chú cũ' },
      { thoi_gian: '2026-11-19T06:00Z', GDKV_phan_loai_KH: 'b', ghi_chu: 'Ghi chú mới' },
      { thoi_gian: '2026-11-18T15:00', GDKV_phan_loai_KH: 'a' },
      { thoi_gian: '2026-11-31T12:00', GDKV_phan_loai_KH: 'a' }
    ] }
  }, (key, value) => key === 'GDKV_phan_loai_KH' && value === 'b' ? 'Quan tâm' : value);
  assert.equal(row[8], 'Web');
  assert.equal(row[14], '16/11/2026 08:00');
  assert.deepEqual(row.slice(21, 28), ['20/11/2026 14:00', 'Ghi chú TVBH', 'Quan tâm',
    '19/11/2026 13:00', 'Có ghi chú trong hồ sơ', '19/11/2026 09:25', '20/11/2026 08:00']);
  assert.ok(!row.includes('Không xuất'));
  assert.deepEqual(mapLeadToRow({ ...lead, assigned_at: '2026-11-20T14:00',
    first_contact_at: '2026-11-18T10:00',
    custom_data: { tvbh_history: [{ thoi_gian: 'không hợp lệ', ghi_chu: 'Không dùng' }] } }).slice(23, 28),
  Array(5).fill(''));
});

test('updates a shortened tab without editing its headers or extra columns', async () => {
  const row = mapLeadToRow(lead);
  const headers = [...sheetHeaders, 'Cột riêng'];
  const { sheets, state, writes } = fakeSheets([headers, [lead.lead_code, ...Array(28).fill(''), '=COUNTA(A2:AC2)']], 30);
  await writeRows(sheets, 'fixture', [{ code: lead.lead_code, values: row }]);
  assert.equal(writes.length, 1);
  assert.deepEqual(state, [headers, [...row, '=COUNTA(A2:AC2)']]);
});

test('refuses writes when the header differs or the key is duplicated', async () => {
  const oldHeaders = [...sheetHeaders];
  oldHeaders.splice(26, 0, 'Thời gian GĐTTKD phân chia cho GĐKV');
  oldHeaders.splice(22, 0, 'Ghi chú CSKH');
  oldHeaders.splice(8, 0, 'Đối tượng khách hàng');
  for (const existing of [[oldHeaders, [lead.lead_code]], [HEADERS, [lead.lead_code], [lead.lead_code]]]) {
    const { sheets, writes } = fakeSheets(existing);
    await assert.rejects(writeRows(sheets, 'fixture', [{ code: lead.lead_code, values: mapLeadToRow(lead) }]),
      /không đúng bố cục|Trùng mã/);
    assert.deepEqual(writes, []);
  }
});

test('disabled sync returns before opening either MySQL or Google connection', async () => {
  delete process.env.LEAD_SHEET_SYNC_ENABLED;
  assert.deepEqual(await getStatus(), { configured: false, message: 'Đồng bộ khách hàng đang tắt' });
  await assert.rejects(startRun(1), { statusCode: 503 });
});
