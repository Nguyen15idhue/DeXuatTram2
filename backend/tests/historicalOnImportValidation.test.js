const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRecord, validateExistingRecord, dateValue, amountValue } = require('../src/services/historicalOnImportValidation');

test('existing workflow statuses and proposal code drivers cannot change through import', () => {
  const snapshot = {
    proposal: { status: 'DEPLOYING', custom_data: { province: 'Hà Nội', mo_hinh_dau_tu: 'NQ' } },
    station: { status: 'INSTALLING' }
  };
  assert.doesNotThrow(() => validateExistingRecord({ model: 'NQ', province: 'Hà Nội', proposal_status: 'Đang triển khai', on_status: 'Lắp trụ' }, snapshot));
  assert.throws(() => validateExistingRecord({ proposal_status: 'Hoạt động' }, snapshot), /trạng thái đề xuất/);
  assert.throws(() => validateExistingRecord({ on_status: 'Hoạt động' }, snapshot), /trạng thái ON trạm/);
  assert.throws(() => validateExistingRecord({ model: 'LK' }, snapshot), /mô hình/);
  assert.throws(() => validateExistingRecord({ province: 'Đà Nẵng' }, snapshot), /tỉnh thành/);
});

test('parses Vietnamese dates and historical contract amounts without inventing missing values', () => {
  assert.equal(dateValue('25/10/2026', 'Ngày ký'), '2026-10-25');
  assert.equal(dateValue('2026-10-25', 'Ngày ký'), '2026-10-25');
  assert.throws(() => dateValue('31/02/2026', 'Ngày ký'), /không hợp lệ/);
  assert.throws(() => dateValue('12/1899', 'Ngày ký'), /ngày phải/);
  assert.equal(amountValue('20.400.000 đ'), 20400000);
  assert.equal(amountValue('20.400.000,50'), 20400000.5);
  assert.equal(amountValue(''), null);
  assert.throws(() => amountValue('#DIV/0!'), /không hợp lệ/);
});

test('requires real contact and coordinates for creation but preserves empty update fields', () => {
  const row = { legacy_code: '01-0326', owner_name: 'A', owner_phone: '0123456789', address: 'B',
    province: 'Hà Nội', latitude: 21, longitude: 105, model: 'NQ',
    poles: [{ model: 'NQ', name: 'AC 22kW', proposed: 10, committed: 10 }] };
  assert.equal(validateRecord(row, { creating: true }).owner_phone, '0123456789');
  assert.throws(() => validateRecord({ ...row, owner_phone: '' }, { creating: true }), /bắt buộc/);
  assert.throws(() => validateRecord({ ...row, latitude: 91 }, { creating: true }), /Vĩ độ không hợp lệ/);
  assert.equal(validateRecord({ legacy_code: '01-0326', poles: [] }).contract_amount, null);
});

test('checks both scales on creation and ensures pole models match the proposal', () => {
  const row = { legacy_code: '01', owner_name: 'A', owner_phone: '0123456789', address: 'B',
    province: 'Hà Nội', latitude: 21, longitude: 105, model: 'NQ_LK',
    poles: [{ model: 'NQ', name: 'AC 22kW', proposed: 2, committed: 2 },
      { model: 'LK', name: 'DC 60kW', proposed: 1, committed: 1 }] };
  assert.equal(validateRecord(row, { creating: true }).poles.length, 2);
  assert.throws(() => validateRecord({ ...row, poles: [row.poles[0]] }, { creating: true }), /cả NQ và LK/);
  assert.throws(() => validateRecord({ ...row, poles: [{ ...row.poles[0], committed: 0 }] }, { creating: true }), /quy mô trụ chốt/);
  assert.throws(() => validateRecord({ ...row, poles: [{ ...row.poles[0], model: 'TDT' }] }, { creating: true }), /không khớp/);
  assert.throws(() => validateRecord({ ...row, poles: [row.poles[0], row.poles[0]] }), /bị lặp/);
});

test('rejects explicit cancellation statuses that contradict the cancellation kind', () => {
  const row = { legacy_code: '01', poles: [], cancel_kind: 'Hủy BCĐX' };
  assert.throws(() => validateRecord({ ...row, proposal_status: 'Đã lưu trữ' }), /Đã hủy/);
  assert.throws(() => validateRecord({ ...row, on_status: 'Hoạt động' }), /trạng thái ON trạm Đã hủy/);
  assert.throws(() => validateRecord({ ...row, cancel_kind: 'Hủy ON trạm', proposal_status: 'Đã hủy' }), /Đã lưu trữ/);
  assert.doesNotThrow(() => validateRecord({ ...row, proposal_status: 'Đã hủy', on_status: 'Đã hủy' }));
  assert.doesNotThrow(() => validateRecord(row));
});
