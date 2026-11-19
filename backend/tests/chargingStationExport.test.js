const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const pool = require('../src/utils/db');
const reports = require('../src/services/proposalReportService');
const { buildExport } = require('../src/services/chargingStationExportService');

test('exports all matching rows for a scoped viewer and preserves Excel values and partial progress', async (t) => {
  const user = { id: 17, role: 'CTV' };
  t.mock.method(reports, 'resolveScope', async () => ({ isAdmin: false }));
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /^SELECT /);
    assert.match(sql, /WHERE.*p\.user_id = \?/s);
    assert.match(sql, /p\.ma_de_xuat_gen LIKE \?/);
    assert.match(sql, /ORDER BY cs\.updated_at DESC, cs\.id DESC$/);
    assert.doesNotMatch(sql, /\bLIMIT\b/);
    assert.deepEqual(params, [17, 17, 17, ...Array(5).fill('%Hà Nội%')]);
    return [Array.from({ length: 205 }, (_, i) => ({
      ma_tram: String(i).padStart(4, '0'), ma_de_xuat: `DX${i}`, status: 'OPERATING',
      contract_status: 'DONE', infra_power_status: 'DOING', infra_site_status: 'DONE',
      shipment_return_pending: 1, installation_started: 1, acceptance_partial: 1, on_partial: 1,
      latitude: '21.123456', longitude: '105.123456', mo_hinh_dau_tu: 'LK',
      proposal_created_epoch: Date.parse('2026-11-19T23:10:00Z') / 1000,
      proposer_name: 'Người A', assignee_name: 'Người B', director_name: 'Người C',
      chot_so_luong_tru: JSON.stringify([{ mo_hinh: 'LK', so_luong: 2, loai_tru: 'DC60Kw' }]),
      proposal_data: JSON.stringify({
        lk_ten_phap_nhan: 'Pháp nhân A', lk_sdt: '0901234567', province: 'Hà Nội', vung_mien: 'Bac',
        mo_hinh_dau_tu: 'LK', tong_chi_phi: '1.234.000 đ'
      })
    }))];
  });
  const result = await buildExport({ stage: 'giao-tru', tab: 'all', search: 'Hà Nội', user });
  assert.match(result.filename, /^on-tram_giao-tru_all_\d{8}_\d{6}\.xlsx$/);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await result.workbook.xlsx.writeBuffer());
  const sheet = reopened.getWorksheet('ON trạm');
  assert.equal(sheet.rowCount, 206);
  assert.equal(sheet.getCell('A206').value, '0204');
  assert.deepEqual(sheet.getRow(2).values.slice(1, 13), [
    '0000', 'Đã ký hợp đồng', 'Đang làm', 'Đã làm', 'Chưa nhận cọc', 'Có chuyến chờ hoàn hàng',
    'Đang lắp trụ', 'Đã nghiệm thu một phần', 'Đã tích hợp một phần', 'DX0', 'Pháp nhân A', '0901234567'
  ]);
  assert.equal(sheet.getCell('Q2').value, 21.123456);
  assert.equal(sheet.getCell('S2').value, 'https://www.google.com/maps?q=21.123456,105.123456');
  assert.deepEqual(sheet.getRow(2).values.slice(20), [
    'Người A', 'Người B', 'Người C', 'LK_2 DC60Kw', '20/11/2026 06:10:00', 1234000
  ]);
});

test('rejects invalid filters and unauthenticated export, and reports empty scope', async (t) => {
  t.mock.method(reports, 'resolveScope', async () => ({ isAdmin: true }));
  const query = t.mock.method(pool, 'query', async () => [[]]);
  const user = { id: 17, role: 'ADMIN' };
  await assert.rejects(buildExport({ stage: 'on-tram', user }), { statusCode: 400 });
  await assert.rejects(buildExport({ stage: 'lap-tru', tab: 'typo', user }), { statusCode: 400 });
  await assert.rejects(buildExport({ stage: 'lap-tru' }), { statusCode: 401 });
  assert.equal(query.mock.callCount(), 0);
  await assert.rejects(buildExport({ stage: 'lap-tru', user }), { statusCode: 404 });
});
