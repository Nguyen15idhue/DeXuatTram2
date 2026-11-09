const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

test('customer workflow, scope, calendar snapshot and warning idempotency', {
  skip: process.env.RUN_LEAD_INTEGRATION_TESTS !== '1', timeout: 90000
}, async () => {
  process.env.TZ = 'Asia/Ho_Chi_Minh';
  const pool = require('../src/utils/db');
  const leads = require('../src/services/leadService');
  const assignments = require('../src/services/leadAssignmentService');
  const consultation = require('../src/services/leadConsultationService');
  const calendar = require('../src/services/businessCalendarService');
  const worker = require('../src/workers/leadConsultationWorker');
  const importJobs = require('../src/services/importJobService');
  const tabsService = require('../src/services/leadTabsService');
  const access = require('../src/services/leadAccessService');
  const prefix = `lead-workflow-${crypto.randomUUID()}`;
  const users = [];
  const journeys = [];
  const department = 'Trung tâm KD miền Bắc';
  const newUser = async (role, dept, title, parent = null) => {
    const [result] = await pool.query(
      `INSERT INTO users (full_name,email,password,role,status,parent_id,custom_data)
       VALUES (?, ?, 'not-a-login-password', ?, 'ACTIVE', ?, ?)`,
      [prefix, `${prefix}-${users.length}@example.invalid`, role, parent, JSON.stringify({ department: dept, chuc_vu: title })]);
    users.push(result.insertId);
    return { id: result.insertId, role };
  };
  try {
    const superAdmin = await newUser('SUPER_ADMIN', '', '');
    const director = await newUser('SALES', department, 'Giám đốc Trung tâm Kinh doanh');
    const gdkv = await newUser('SALES', department, 'Giám đốc Khu vực', director.id);
    const secondGdkv = await newUser('SALES', department, 'Giám đốc Khu vực', director.id);
    const outsider = await newUser('SALES', 'Trung tâm KD miền Nam', 'Giám đốc Khu vực');
    const planning = await newUser('ADMIN', 'Phòng Công nghệ và Quy hoạch', 'Chuyên viên');
    const tgd = await newUser('ADMIN', 'Ban Tổng Giám đốc', 'Tổng Giám đốc');
    const admin = await newUser('ADMIN', 'Back office', 'Chuyên viên');
    const staff = await newUser('SALES', department, 'Chuyên viên', director.id);
    const compareCounts = async (actor) => {
      const summary = await tabsService.getTaskCounts(actor);
      for (const tab of summary.tabs) {
        const list = await leads.getLeads({ tab, limit: 1 }, actor);
        assert.equal(list.pagination.total, summary.counts[tab], `count for ${actor.id}/${tab}`);
      }
      const policy = access.tabPolicy(await access.getContext(actor));
      assert.equal(summary.total, policy.taskTabs.reduce((sum, tab) => sum + summary.counts[tab], 0));
      return summary;
    };
    await importJobs.create({ id: prefix, entity: 'leads', rows: [], createdBy: superAdmin.id });
    await assert.rejects(() => importJobs.getByIdScoped(prefix, planning), { statusCode: 403 });
    await assert.rejects(() => importJobs.listScoped({ entity: 'leads' }, 1, 20, planning), { statusCode: 403 });
    const visibleJobs = await importJobs.listScoped({}, 1, 100, planning);
    assert.ok(visibleJobs.data.every((job) => job.entity !== 'leads'));
    assert.equal((await importJobs.getByIdScoped(prefix, superAdmin)).entity, 'leads');
    const newLead = async (suffix = '') => {
      const [journey] = await pool.query(
        "INSERT INTO business_journeys (journey_code,current_stage,status,started_at) VALUES (?, 'NEW','ACTIVE',NOW())",
        [crypto.randomUUID()]);
      journeys.push(journey.insertId);
      const [result] = await pool.query(
        `INSERT INTO leads (journey_id,full_name,phone,created_by,customer_classification,assigned_department,
         assigned_user_id,consultation_status) VALUES (?,?,'0900000000',?,'TIEM_NANG',?,?,'WAITING_ALLOCATION')`,
        [journey.insertId, prefix + suffix, superAdmin.id, department, director.id]);
      return result.insertId;
    };
    const id = await newLead();
    assert.equal((await leads.getLeads({ search: prefix }, director)).leads[0].id, id);
    await compareCounts(superAdmin);
    await compareCounts(director);
    await compareCounts(tgd);
    await compareCounts(planning);
    assert.equal((await compareCounts(staff)).total, 0);
    await assert.rejects(() => leads.getLeads({ tab: 'completed' }, director), { statusCode: 403 });
    await assert.rejects(() => leads.getLeads({ tab: 'allocation' }, gdkv), { statusCode: 403 });
    await assert.rejects(() => leads.getLeads({ tab: 'unknown' }, superAdmin), { statusCode: 400 });
    await assert.rejects(() => leads.updateLead(id, { tvbh_note: 'TGĐ chỉ đọc' }, tgd), { statusCode: 403 });
    await assert.rejects(() => leads.updateLead(id, { tvbh_note: 'Nhân sự khác chỉ đọc' }, staff), { statusCode: 403 });
    assert.equal(await leads.canAccessLead(await leads.getLeadById(id), planning), true);
    await assert.rejects(() => leads.getLeads({}, admin), { statusCode: 403 });
    await assert.rejects(() => assignments.assignLead(id, gdkv.id, tgd), { statusCode: 403 });
    await assert.rejects(() => assignments.assignLead(id, gdkv.id, planning), { statusCode: 403 });
    await assignments.assignLead(id, gdkv.id, director);
    let lead = await leads.getLeadById(id);
    assert.equal(lead.consultation_status, 'WAITING_FIRST_CONTACT');
    assert.equal(lead.consultation_round, 1);
    await compareCounts(gdkv);
    assert.equal((await leads.getLeads({ tab: 'allocation', search: prefix }, director)).pagination.total, 0);
    assert.equal((await leads.getLeads({ tab: 'allocated', search: prefix }, director)).pagination.total, 1);
    assert.ok(lead.consultation_calendar_id);
    const activeCalendar = await calendar.getCalendarById(lead.consultation_calendar_id);
    assert.ok(Math.abs(calendar.workingMinutesBetween(lead.first_contact_started_at, lead.first_contact_deadline_at, activeCalendar) - 240) < 0.1);
    assert.equal(await leads.canAccessLead(lead, outsider), false);
    assert.equal(await leads.canAccessLead(lead, director), true);
    const assignedList = await leads.getLeads({ search: prefix }, gdkv);
    assert.equal(assignedList.leads.find((item) => item.id === id)?.permissions.can_consult, true);
    await assert.rejects(() => leads.updateLead(id, { tvbh_history: [{ ghi_chu: 'Không được phép' }] }, planning), { statusCode: 403 });
    await assert.rejects(() => leads.updateLead(id, { full_name: 'Không được phép' }, gdkv), { statusCode: 403 });
    await assignments.assignLead(id, secondGdkv.id, director);
    lead = await leads.getLeadById(id);
    assert.equal(lead.consultation_round, 2);
    await leads.updateLead(id, { tvbh_history: [{ ghi_chu: 'Đã tư vấn lần đầu' }] }, director);
    lead = await leads.getLeadById(id);
    assert.equal(lead.consultation_status, 'CONSULTING');
    assert.equal((await leads.getLeads({ tab: 'first-contact', search: prefix }, secondGdkv)).pagination.total, 0);
    assert.equal((await leads.getLeads({ tab: 'consulting', search: prefix }, secondGdkv)).pagination.total, 1);
    await compareCounts(secondGdkv);
    assert.ok(lead.first_contact_at);
    assert.equal(await consultation.getTiming(lead), null);
    await assignments.assignLead(id, gdkv.id, director);
    lead = await leads.getLeadById(id);
    assert.equal(lead.consultation_status, 'CONSULTING');
    assert.equal(lead.consultation_round, 2);
    await leads.updateLead(id, { sales_outcome: 'SUCCESS' }, gdkv);
    assert.equal((await leads.getLeadById(id)).consultation_status, 'SUCCESS');
    assert.equal((await leads.getLeads({ tab: 'consulting', search: prefix }, gdkv)).pagination.total, 0);
    assert.equal((await leads.getLeads({ tab: 'completed', search: prefix }, gdkv)).pagination.total, 1);
    assert.equal((await leads.getLeads({ tab: 'allocated', search: prefix }, director)).pagination.total, 1);
    await compareCounts(gdkv);
    await assert.rejects(() => require('../src/services/leadProposalService').createProposalFromLead(id, {}, tgd), { statusCode: 403 });

    const warningId = await newLead('warning');
    await assignments.assignLead(warningId, gdkv.id, director);
    await leads.updateLead(warningId, { tvbh_history: [{ thoi_gian: new Date().toISOString() }] }, gdkv);
    assert.equal((await leads.getLeadById(warningId)).consultation_status, 'WAITING_FIRST_CONTACT');
    const deadline = calendar.addWorkingMinutes(new Date(), 30, activeCalendar);
    await pool.query('UPDATE leads SET first_contact_deadline_at = ? WHERE id = ?', [deadline, warningId]);
    await worker.tick();
    await worker.tick();
    const [[count]] = await pool.query(
      "SELECT COUNT(*) AS n FROM notifications WHERE entity_type='leads' AND entity_id=? AND user_id IN (?,?)",
      [warningId, director.id, gdkv.id]);
    assert.equal(count.n, 2);
    await assignments.assignLead(warningId, secondGdkv.id, director);
    assert.equal((await leads.getLeadById(warningId)).consultation_round, 2);
    await assert.rejects(() => leads.updateLead(warningId, { sales_outcome: 'FAILED' }, secondGdkv), { statusCode: 400 });
    await leads.updateLead(warningId, { sales_outcome: 'FAILED', tvbh_note: 'Khách hàng không có nhu cầu' }, secondGdkv);
    await assignments.assignLead(warningId, gdkv.id, director);
    assert.equal((await leads.getLeadById(warningId)).consultation_status, 'FAILED');
    assert.equal((await leads.getLeadById(warningId)).consultation_round, 2);

    const [[pending]] = await pool.query('SELECT COUNT(*) AS n FROM leads WHERE journey_id IN (?)', [journeys]);
    assert.equal(pending.n, 2);
  } finally {
    await pool.query('DELETE FROM import_jobs WHERE id = ?', [prefix]);
    if (journeys.length) {
      const [rows] = await pool.query('SELECT id FROM leads WHERE journey_id IN (?)', [journeys]);
      if (rows.length) await pool.query("DELETE FROM notifications WHERE entity_type='leads' AND entity_id IN (?)", [rows.map((row) => row.id)]);
      await pool.query('DELETE FROM business_journeys WHERE id IN (?)', [journeys]);
    }
    for (const id of users.reverse()) await pool.query('DELETE FROM users WHERE id = ?', [id]);
    await pool.end();
  }
});
