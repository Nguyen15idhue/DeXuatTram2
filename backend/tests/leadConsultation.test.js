const { test } = require('node:test');
const assert = require('node:assert/strict');
const access = require('../src/services/lead/leadAccessService.js');
const consultation = require('../src/services/lead/leadConsultationService.js');

const user = (role, department = '', chuc_vu = '') => ({ role, custom_data: { department, chuc_vu } });

test('customer access depends on title/department, not ADMIN/MKT bypass', () => {
  assert.equal(access.context(user('SUPER_ADMIN')).canAccess, true);
  assert.equal(access.context(user('ADMIN')).canAccess, false);
  assert.equal(access.context(user('MKT')).canAccess, false);
  assert.equal(access.context(user('ADMIN', 'Ban Tổng Giám đốc', 'Tổng Giám đốc')).canAccess, true);
  assert.equal(access.context(user('ADMIN', 'Phòng Tài chính', 'Phó Tổng Giám đốc')).canAccess, false);
  assert.equal(access.context(user('MKT', 'Phòng Công nghệ và Quy hoạch')).isPlanning, true);
  for (const region of ['Bắc', 'Trung', 'Nam']) {
    assert.equal(access.context(user('SALES', `Trung tâm KD miền ${region}`)).canAccess, true);
  }
  for (const role of ['ADMIN', 'MKT', 'CTV', 'NPP']) {
    assert.equal(access.context(user(role, 'Kênh Nhà phân phối')).canAccess, false);
  }
  assert.equal(access.context(user('SALES', 'Kênh Nhà phân phối khác')).canAccess, false);
});

test('distributor SALES can view all leads but cannot update them', async () => {
  const member = { ...user('SALES', '  KÊNH Nhà phân phối  ', 'Trưởng phòng phụ trách kênh NPP'), id: 99, status: 'ACTIVE' };
  const executor = { query: async () => [[member]] };
  const otherLead = { assigned_user_id: 23, assigned_department: 'Trung tâm KD miền Bắc' };
  assert.equal(await access.buildScope(member, executor), null);
  const policy = access.tabPolicy(access.context(member));
  assert.equal(policy.defaultTab, 'all');
  assert.deepEqual(policy.taskTabs, []);
  assert.deepEqual(await access.permissions(otherLead, member, executor), {
    can_view: true, can_consult: false, can_assign: false, can_write_general: false
  });
  await assert.rejects(consultation.assertUpdateAllowed(otherLead, { tvbh_note: 'Không ghi' }, member, executor),
    { statusCode: 403 });
});
test('Executive Office can read leads across departments without gaining write permissions', async () => {
  const member = { ...user('SALES', '  BAN Tổng Giám đốc  ', 'Chuyên viên'), id: 98, status: 'ACTIVE' };
  const executor = { query: async () => [[member]] };
  const otherLead = { assigned_user_id: 23, assigned_department: 'Trung tâm KD miền Bắc' };
  assert.equal(await access.buildScope(member, executor), null);
  assert.equal(access.tabPolicy(access.context(member)).defaultTab, 'all');
  assert.deepEqual(await access.permissions(otherLead, member, executor), {
    can_view: true, can_consult: false, can_assign: false, can_write_general: false
  });
  await assert.rejects(consultation.assertUpdateAllowed(otherLead, { tvbh_note: 'Không ghi' }, member, executor),
    { statusCode: 403 });
});

test('full form empty and scalar user values compare consistently', () => {
  assert.equal(consultation.same(null, []), true);
  assert.equal(consultation.same('', {}), true);
  assert.equal(consultation.same({ id: 12 }, '12'), true);
  assert.equal(consultation.same({ id: 12 }, 13), false);
});

test('tab policies follow title priority and defaults', () => {
  const policy = (role, department, title) => access.tabPolicy(access.context(user(role, department, title)));
  assert.equal(policy('SUPER_ADMIN').tabs.length, 6);
  assert.equal(policy('ADMIN', '', 'Tổng Giám đốc').defaultTab, 'all');
  assert.equal(policy('SALES', 'Phòng Công nghệ và Quy hoạch').tabs.length, 6);
  assert.deepEqual(policy('MKT', 'Trung tâm KD miền Bắc', 'Giám đốc Trung tâm Kinh doanh').tabs, ['allocation', 'allocated', 'all']);
  assert.deepEqual(policy('SALES', 'Trung tâm KD miền Nam', 'Giám đốc Khu vực').taskTabs, ['first-contact', 'consulting']);
  assert.deepEqual(policy('SALES', 'Trung tâm KD miền Nam', 'Chuyên viên').tabs, ['all']);
});

test('empty TVBH row or timestamp alone does not count as first contact', async () => {
  for (const row of [{}, { thoi_gian: '2026-11-10T08:00:00+07:00' }]) {
    const calls = [];
    await consultation.afterUpdate({ query: async (...args) => { calls.push(args); } },
      { id: 1, custom_data: { tvbh_history: [] } }, { tvbh_history: [row] });
    assert.equal(calls.length, 0);
  }
});

test('new TVBH row changes status; outcome takes priority', async () => {
  const calls = [];
  const executor = { query: async (...args) => { calls.push(args); } };
  const lead = { id: 1, custom_data: { tvbh_history: [] } };
  await consultation.afterUpdate(executor, lead, { tvbh_history: [{ ghi_chu: 'Đã gọi khách' }] });
  assert.equal(calls[0][1][0], 'CONSULTING');
  calls.length = 0;
  await consultation.afterUpdate(executor, lead, { sales_outcome: 'SUCCESS', tvbh_history: [{ ghi_chu: 'Đã chốt' }] });
  assert.equal(calls[0][1][0], 'SUCCESS');
});

test('editing old history is not a new consultation', async () => {
  const calls = [];
  await consultation.afterUpdate({ query: async (...args) => { calls.push(args); } },
    { id: 1, custom_data: { tvbh_history: [{ ghi_chu: 'Cũ' }] } }, { tvbh_history: [{ ghi_chu: 'Sửa' }] });
  assert.equal(calls.length, 0);
});
