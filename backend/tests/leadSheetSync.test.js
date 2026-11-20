const test = require('node:test');
const assert = require('node:assert/strict');
const { HEADERS, getStatus, startRun, mapLeadToRow, writeRows } = require('../src/services/leadSheetSyncService');

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

function fakeSheets(rows) {
  const writes = [];
  const state = structuredClone(rows);
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: {
      sheetId: 7, title: 'QL_khach_hang', sheetType: 'GRID', gridProperties: { rowCount: 100, columnCount: 27 }
    } }] } }),
    batchUpdate: async (request) => { writes.push(request); },
    values: {
      get: async ({ range }) => {
        assert.equal(range, "'QL_khach_hang'");
        return { data: { values: structuredClone(state) } };
      },
      batchUpdate: async (request) => {
        writes.push(request);
        assert.equal(request.requestBody.valueInputOption, 'RAW');
        for (const { range, values: [values] } of request.requestBody.data) {
          const [, row] = /^'QL_khach_hang'!A(\d+):Z\1$/.exec(range);
          state[row - 1] = [...values, ...(state[row - 1]?.slice(26) || [])];
        }
      }
    }
  } };
  return { sheets, writes, state };
}

test('joins both history tables into one cell in chronological order and separates department fields', () => {
  const row = mapLeadToRow(lead, (key, value) => key === 'cskh_history' && value === 'PENDING' ? 'Chờ liên hệ' : value);
  assert.equal(row[2], '0123456789');
  assert.equal(row[13], 'GĐKV đang tư vấn');
  assert.deepEqual(row.slice(17, 22), ['7', 'Người phụ trách thử', 'GĐKV', 'Phòng hiện tại', 'Phòng phân chia']);
  assert.equal(row[25], [
    '1. TVBH -- 18/11/2026 09:15 -- Đã tư vấn -- Đã trao đổi',
    '2. CSKH -- 19/11/2026 14:30 -- Chờ liên hệ -- Gọi lại ↵ Ngày mai — buổi sáng'
  ].join('\n'));
});

test('initializes, writes literal text, updates by code without duplication, and clears only managed cells', async () => {
  const { sheets, state, writes } = fakeSheets([]);
  const row = mapLeadToRow(lead);
  await writeRows(sheets, 'fixture', [{ code: lead.lead_code, values: row }]);
  assert.deepEqual(state[0], HEADERS);
  assert.equal(writes[0].requestBody.requests[0].repeatCell.cell.userEnteredFormat.wrapStrategy, 'WRAP');
  state[1][26] = 'Ghi chú ngoài vùng';
  await writeRows(sheets, 'fixture', [{ code: lead.lead_code, values: mapLeadToRow({ ...lead, full_name: 'Tên mới' }) }]);
  assert.equal(state.length, 2);
  assert.equal(state[1][1], 'Tên mới');
  assert.equal(state[1][10], '=1+2');
  await writeRows(sheets, 'fixture', [{ code: lead.lead_code, values: null }]);
  assert.deepEqual(state[1].slice(0, 26), Array(26).fill(''));
  assert.equal(state[1][26], 'Ghi chú ngoài vùng');
});

test('refuses writes when the header differs or the key is duplicated', async () => {
  for (const existing of [[['Sai bố cục']], [HEADERS, [lead.lead_code], [lead.lead_code]]]) {
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
