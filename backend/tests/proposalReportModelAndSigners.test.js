const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const reports = require('../src/services/proposalReportService');
const approval = require('../src/services/proposalApprovalService');
const users = require('../src/services/adminUserService');
const documents = require('../src/services/proposalReportDocumentService');
const lifecycle = require('../src/services/proposalLifecycle');
const requests = require('../src/services/proposalRequestService');

const user = (id, department, chuc_vu, role = 'SALES') => ({
  id, full_name: `User ${id}`, role, custom_data: { department, chuc_vu }
});

test('signer groups prioritize department/title, then owner, assignee and all CTV ancestors without duplicates', async (t) => {
  const rows = [
    user(1, 'Ban Tổng giám đốc', 'Tổng giám đốc'),
    user(2, 'Ban Tổng giám đốc', 'Phó Tổng giám đốc'),
    user(3, 'Ban Tổng giám đốc', 'Chuyên viên'),
    user(4, 'Phòng Tài chính', 'Trưởng phòng'),
    user(5, 'Phòng Back Office', 'Chuyên viên'),
    user(6, 'Kinh doanh', 'CTV', 'CTV'),
    user(7, 'Kinh doanh', 'GĐKV'),
    user(8, 'Kinh doanh', 'GĐTT'),
    user(9, 'Kinh doanh', 'CTV', 'CTV'),
  ];
  let proposal = { id: 71, user_id: 9, custom_data: { nguoi_phu_trach: { id: 6 } } };
  t.mock.method(reports, 'resolveScope', async () => ({ isAdmin: true }));
  const ancestors = t.mock.method(users, 'getAncestorIds', async id => {
    assert.equal(id, 6);
    return [7, 8, 1, 4, 5, 9];
  });
  t.mock.method(pool, 'query', async sql =>
    [sql.includes('FROM users') ? rows : [proposal]]);
  const candidates = async () => (await approval.getSignerCandidates({ user: { id: 1 }, id: 71 })).candidates;
  const initial = await candidates();
  assert.deepEqual(initial.map(row => [row.id, row.category]), [
    [1, 'Tổng giám đốc'], [4, 'Phòng Tài chính'], [5, 'Back Office'],
    [9, 'Người đề xuất'], [6, 'Người phụ trách'], [7, 'Người quản lý'], [8, 'Người quản lý']
  ]);
  assert.equal(new Set(initial.map(row => row.id)).size, initial.length);
  proposal.user_id = 1;
  assert.equal((await candidates()).find(row => row.id === 1).category, 'Tổng giám đốc');
  proposal.user_id = 6;
  assert.equal((await candidates()).find(row => row.id === 6).category, 'Người đề xuất');
  proposal.custom_data = JSON.stringify({ nguoi_phu_trach: { id: 7 } });
  const calls = ancestors.mock.callCount();
  assert.equal((await candidates()).some(row => row.category === 'Người quản lý'), false);
  assert.equal(ancestors.mock.callCount(), calls);
  proposal.custom_data = {};
  assert.equal((await candidates()).some(row => row.category === 'Người phụ trách'), false);
});

test('report submission derives model from committed poles, keeps TDT amounts and preserves code/source tables', async (t) => {
  const file = { id: 11, original_name: 'report.pdf', mime_type: 'application/pdf' };
  const originalCustom = {
    ma_de_xuat: 'TDT_HNO_0001', mo_hinh_dau_tu: 'TDT', loai_uu_tien: 1,
    tdt_tru: [{ so_luong: 10, loai_tru: 'DC60' }], other_field: 'preserve',
  };
  let stage;
  let saved;
  let log;
  const query = async (sql, params = []) => {
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
    if (sql.includes('FROM users WHERE id')) return [[{ custom_data: {} }]];
    if (sql.includes('FROM station_proposals')) {
      return [[{ id: 71, user_id: 1, status: stage, custom_data: originalCustom }]];
    }
    if (sql.includes('FROM files')) return [[file]];
    if (sql.includes('FROM data_list_rows')) return [[{ data: { ten: 'DC60', gia: 100 } }]];
    if (sql.includes('UPDATE station_proposals')) {
      saved = { custom: JSON.parse(params[0]), rows: JSON.parse(params[1]), total: params[2] };
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  t.mock.method(pool, 'query', query);
  t.mock.method(pool, 'getConnection', async () => ({
    query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {}
  }));
  t.mock.method(documents, 'prepareDocuments', async () => [{ id: 91, signing_file: file }]);
  t.mock.method(documents, 'activateDocuments', async () => {});
  t.mock.method(lifecycle, 'logActivity', async event => { log = event; });
  t.mock.method(lifecycle, 'transition', async () => ({}));
  t.mock.method(requests, 'closeRequests', async () => {});
  const submit = models => reports.uploadReport({
    user: { id: 1, role: 'SUPER_ADMIN' }, id: 71, files: [file],
    chotSoLuongTru: models.map(mo_hinh => ({ mo_hinh, so_luong: 2, loai_tru: 'DC60' })),
  });
  for (stage of ['PROPOSAL_REPORT_CREATING', 'PROPOSAL_REPORT_RE_CREATING', 'PROPOSAL_REPORT_UPDATING']) {
    for (const [models, expected] of [
      [['TDT'], 'TDT'], [['LK'], 'LK'], [['NQ'], 'NQ'], [['LK', 'NQ'], 'NQ_LK'],
      [['TDT', 'LK'], 'LK'], [['TDT', 'NQ'], 'NQ'], [['TDT', 'LK', 'NQ'], 'NQ_LK'],
    ]) {
      const result = await submit(models);
      assert.equal(saved.custom.mo_hinh_dau_tu, expected);
      assert.equal(result.mo_hinh_dau_tu, expected);
      assert.equal(saved.custom.loai_uu_tien, expected === 'TDT' ? 1 : 2);
      assert.equal(saved.total, models.length * 200);
      assert.equal(saved.rows.length, models.length);
      assert.equal(saved.custom.ma_de_xuat, originalCustom.ma_de_xuat);
      assert.deepEqual(saved.custom.tdt_tru, originalCustom.tdt_tru);
      assert.equal(saved.custom.other_field, 'preserve');
      if (expected !== 'TDT') assert.equal(log.changedFields.mo_hinh_dau_tu.new, expected);
    }
  }
  saved = null;
  await assert.rejects(submit(['NQ_LK']), /sửa hoặc tách NQ_LK/);
  await assert.rejects(submit(['INVALID']), /chỉ chọn TDT, LK hoặc NQ/);
  await assert.rejects(submit([]), /Vui lòng nhập số lượng trụ chốt/);
  assert.equal(saved, null);
});

test('saving signature config rejects users excluded by the updated candidate rules', async (t) => {
  const signature = require('../src/services/proposalSignatureService');
  t.mock.method(reports, 'resolveScope', async () => ({ role: 'SUPER_ADMIN', isAdmin: true }));
  t.mock.method(signature._internals, 'withSignatureMutationLock', async (_id, action) => action());
  t.mock.method(documents, 'listDocuments', async () => [{
    id: 91, conversion_status: 'READY', signing_file: { id: 11, mime_type: 'application/pdf', original_name: 'report.pdf' }
  }]);
  t.mock.method(pool, 'query', async sql => [sql.includes('FROM users')
    ? [user(2, 'Ban Tổng giám đốc', 'Phó Tổng giám đốc')]
    : [{ id: 71, user_id: 7, status: 'PROPOSAL_REPORT_REVIEWING', custom_data: {} }]]);
  await assert.rejects(approval.configureSignature({
    user: { id: 1, role: 'SUPER_ADMIN' }, id: 71,
    documents: [{ document_id: 91, file_id: 11, signers: [{ user_id: 2 }] }]
  }), /Chỉ được chọn người ký thuộc các nhóm được phép/);
});

test.after(async () => { await pool.end(); });
