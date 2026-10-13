const pool = require('./src/utils/db');
const worker = require('./src/workers/proposalLifecycleWorker');
const proposalLifecycle = require('./src/services/proposalLifecycle');
const adminProposalService = require('./src/services/adminProposalService');
const myProposalService = require('./src/services/myProposalService');

const API = 'http://localhost:3000';
const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};
const ids = [];
const cleanup = async () => {
  for (const id of ids) {
    await pool.query('DELETE FROM proposal_activity_logs WHERE proposal_id = ?', [id]);
    await pool.query("DELETE FROM notifications WHERE entity_type = 'station_proposals' AND entity_id = ?", [id]);
    await pool.query('DELETE FROM station_proposals WHERE id = ?', [id]);
  }
};
const mkProposal = async ({ status = 'PENDING', deadlineSql = 'DATE_ADD(NOW(), INTERVAL 2 DAY)', completed = false, userId = 241 }) => {
  const [ins] = await pool.query(
    `INSERT INTO station_proposals (user_id, status, latitude, longitude, owner_name, owner_phone, custom_data, supplement_deadline_at, info_completed_at)
     VALUES (?, ?, 10.1, 106.1, 'TEST_INFO_COMPLETED', '0900000000', CAST('{}' AS JSON), ${deadlineSql}, ${completed ? 'NOW()' : 'NULL'})`,
    [userId, status]
  );
  ids.push(ins.insertId);
  return ins.insertId;
};
const getRow = async (id) => {
  const [r] = await pool.query('SELECT status, reject_reason, info_completed_at FROM station_proposals WHERE id = ?', [id]);
  return r[0];
};

async function main() {
  const [[mig]] = await pool.query("SELECT COUNT(*) AS n FROM schema_migrations WHERE filename = '115-proposal-info-completed.sql'");
  const [[col]] = await pool.query("SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'info_completed_at'");
  check('migration 115 da chay + co cot moi', Number(mig.n) === 1 && Number(col.n) === 1, `mig=${mig.n} col=${col.n}`);

  const overdueId = await mkProposal({ deadlineSql: 'DATE_SUB(NOW(), INTERVAL 2 HOUR)' });
  const acted = await worker.processDeadlines();
  const r1 = await getRow(overdueId);
  check('worker tu huy de xuat qua han', r1.status === 'CANCELLED', `status=${r1.status}`);
  check('ly do huy dung cau chuan', r1.reject_reason === 'Chưa cập nhật đầy đủ thông tin', `reason=${r1.reject_reason}`);
  const [lc] = await pool.query(
    "SELECT COUNT(*) AS n FROM proposal_activity_logs WHERE proposal_id = ? AND action = 'status_change' AND from_status = 'PENDING' AND to_status = 'CANCELLED'",
    [overdueId]
  );
  check('ghi log activity huy tu dong', Number(lc[0].n) === 1, `logs=${lc[0].n}`);
  await worker.processDeadlines();
  const [lc2] = await pool.query(
    "SELECT COUNT(*) AS n FROM proposal_activity_logs WHERE proposal_id = ? AND action = 'status_change' AND to_status = 'CANCELLED'",
    [overdueId]
  );
  check('chay lap khong huy trung', Number(lc2[0].n) === 1, `logs=${lc2[0].n}`);

  const doneId = await mkProposal({ deadlineSql: 'DATE_SUB(NOW(), INTERVAL 2 HOUR)', completed: true });
  await worker.processDeadlines();
  const r2 = await getRow(doneId);
  check('de xuat da xac nhan qua han khong bi huy', r2.status === 'PENDING', `status=${r2.status}`);

  const freshId = await mkProposal({});
  const cf = await proposalLifecycle.setInfoCompleted(freshId, true, { actorId: 1, actorRole: 'SUPER_ADMIN', source: 'user' });
  const r3 = await getRow(freshId);
  check('xac nhan set co hoan thien', !!r3.info_completed_at && cf.completed === true, `completed=${cf.completed}`);
  const [ln] = await pool.query(
    "SELECT COUNT(*) AS n FROM notifications WHERE entity_type = 'station_proposals' AND entity_id = ? AND type = 'INFO_COMPLETED'",
    [freshId]
  );
  check('thong bao admin khi xac nhan', Number(ln[0].n) > 0, `notifs=${ln[0].n}`);
  const [la] = await pool.query(
    "SELECT COUNT(*) AS n FROM proposal_activity_logs WHERE proposal_id = ? AND action = 'info_completed'",
    [freshId]
  );
  check('ghi log info_completed', Number(la[0].n) === 1, `logs=${la[0].n}`);
  const cf2 = await proposalLifecycle.setInfoCompleted(freshId, true, { actorId: 1, source: 'user' });
  check('xac nhan lap idempotent', cf2.unchanged === true, `unchanged=${cf2.unchanged}`);
  await proposalLifecycle.setInfoCompleted(freshId, false, { actorId: 1, source: 'user' });
  const r4 = await getRow(freshId);
  const [la2] = await pool.query(
    "SELECT COUNT(*) AS n FROM proposal_activity_logs WHERE proposal_id = ? AND action = 'info_reopened'",
    [freshId]
  );
  check('undo mo lai giu deadline cu', !r4.info_completed_at && Number(la2[0].n) === 1, `flag=${r4.info_completed_at}`);

  let cancelErr = null;
  try {
    await proposalLifecycle.setInfoCompleted(overdueId, true, { actorId: 1, source: 'user' });
  } catch (e) { cancelErr = e; }
  check('de xuat da huy khong xac nhan duoc', cancelErr && cancelErr.statusCode === 400, `err=${cancelErr && cancelErr.message}`);

  const ctvId = await mkProposal({ userId: 269 });
  await proposalLifecycle.setInfoCompleted(ctvId, true, { actorId: 269, actorRole: 'CTV', source: 'user' });
  const [np] = await pool.query(
    "SELECT COUNT(*) AS n FROM notifications WHERE entity_type = 'station_proposals' AND entity_id = ? AND type = 'INFO_COMPLETED' AND user_id = 247",
    [ctvId]
  );
  check('CTV xac nhan thi GDKV nhan chuong', Number(np[0].n) === 1, `notifs=${np[0].n}`);
  const [ns] = await pool.query(
    "SELECT COUNT(*) AS n FROM notifications WHERE entity_type = 'station_proposals' AND entity_id = ? AND type = 'INFO_COMPLETED' AND user_id = 269",
    [ctvId]
  );
  check('nguoi xac nhan khong tu nhan chuong', Number(ns[0].n) === 0, `notifs=${ns[0].n}`);
  await proposalLifecycle.setInfoCompleted(ctvId, false, { actorId: 269, actorRole: 'CTV', source: 'user' });
  const [nr] = await pool.query(
    "SELECT COUNT(*) AS n FROM notifications WHERE entity_type = 'station_proposals' AND entity_id = ? AND type = 'INFO_REOPENED' AND user_id = 247",
    [ctvId]
  );
  check('undo cung bao GDKV', Number(nr[0].n) === 1, `notifs=${nr[0].n}`);

  const extId = await mkProposal({ userId: 269, deadlineSql: 'DATE_ADD(NOW(), INTERVAL 2 HOUR)' });
  await proposalLifecycle.setInfoCompleted(extId, true, { actorId: 269, actorRole: 'CTV', source: 'user' });
  const [de0] = await pool.query('SELECT supplement_deadline_at AS d FROM station_proposals WHERE id = ?', [extId]);
  const er = await proposalLifecycle.extendDeadline(extId, { days: 1, hours: 2, reason: 'Cho them thoi gian lay so' }, { actorId: 269, actorRole: 'CTV', source: 'user' });
  const [de1] = await pool.query('SELECT supplement_deadline_at AS d, info_completed_at AS f FROM station_proposals WHERE id = ?', [extId]);
  const diffMin = Math.round((new Date(de1[0].d).getTime() - new Date(de0[0].d).getTime()) / 60000);
  check('gia han cong dung thoi gian', er.days === 1 && er.hours === 2 && diffMin === 1560, `diff=${diffMin}ph`);
  check('gia han xoa co xac nhan', !de1[0].f, `flag=${de1[0].f}`);
  const [le] = await pool.query(
    "SELECT COUNT(*) AS n FROM proposal_activity_logs WHERE proposal_id = ? AND action = 'deadline_extended' AND reject_reason = 'Cho them thoi gian lay so'",
    [extId]
  );
  check('gia han luu log + ly do', Number(le[0].n) === 1, `logs=${le[0].n}`);
  const [ne] = await pool.query(
    "SELECT COUNT(*) AS n FROM notifications WHERE entity_type = 'station_proposals' AND entity_id = ? AND type = 'SUPPLEMENT_EXTENDED' AND user_id = 247",
    [extId]
  );
  check('gia han bao GDKV', Number(ne[0].n) === 1, `notifs=${ne[0].n}`);

  const badCases = [
    [{ days: 0, hours: 0, reason: 'x' }, 'tong bang 0'],
    [{ days: 31, hours: 0, reason: 'x' }, 'qua tran ngay'],
    [{ days: 0, hours: 24, reason: 'x' }, 'qua tran gio'],
    [{ days: 1, hours: 0, reason: '  ' }, 'thieu ly do']
  ];
  for (const [body, label] of badCases) {
    let e = null;
    try { await proposalLifecycle.extendDeadline(extId, body, { actorId: 269, source: 'user' }); } catch (err) { e = err; }
    check(`gia han validate: ${label}`, e && e.statusCode === 400, e && e.message);
  }
  const odId = await mkProposal({ deadlineSql: 'DATE_SUB(NOW(), INTERVAL 1 HOUR)' });
  let odErr = null;
  try { await proposalLifecycle.extendDeadline(odId, { days: 1, hours: 0, reason: 'cuu' }, { actorId: 1, source: 'user' }); } catch (e) { odErr = e; }
  check('qua han khong gia han duoc', odErr && odErr.statusCode === 400, odErr && odErr.message);

  const grpId = await mkProposal({});
  await proposalLifecycle.setInfoCompleted(grpId, true, { actorId: 1, source: 'user' });
  // Dung source system_auto de bypass cong completeness/webhook-only (tinh nang khac):
  // logic giu/xoa co theo nhom countdown khong phu thuoc source.
  await proposalLifecycle.transition(grpId, 'REVIEWING', { actorId: 1, source: 'system_auto' });
  const rg = await getRow(grpId);
  check('cung nhom PENDING-REVIEWING giu co', !!rg.info_completed_at, `flag=${rg.info_completed_at}`);
  const [d1] = await pool.query('SELECT supplement_deadline_at AS d FROM station_proposals WHERE id = ?', [grpId]);
  await proposalLifecycle.transition(grpId, 'PRINCIPLE_APPROVED', { actorId: 1, source: 'system_auto' });
  const [d2] = await pool.query('SELECT supplement_deadline_at AS d, info_completed_at AS f FROM station_proposals WHERE id = ?', [grpId]);
  check(
    'sang moc moi reset deadline + xoa co',
    !d2[0].f && String(d2[0].d) !== String(d1[0].d),
    `flag=${d2[0].f}`
  );

  const adminList = await adminProposalService.getAllProposals(null, '', 1, 5, { role: 'SUPER_ADMIN' });
  check('admin list tra field moi', adminList.proposals.length > 0 && 'info_completed_at' in adminList.proposals[0]);
  const myList = await myProposalService.getUserProposals(241, null, '', 1, 5);
  check('my-proposals list tra field moi', myList.proposals.length >= 0 && (myList.proposals.length === 0 || 'info_completed_at' in myList.proposals[0]));

  const noAuth = await fetch(`${API}/api/admin/proposals/${freshId}/confirm-info`, { method: 'POST' });
  check('route admin can auth (401 khong token)', noAuth.status === 401, `status=${noAuth.status}`);
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@station.com', password: '123456' })
  });
  const { data: loginData } = await login.json();
  const token = loginData && loginData.token;
  check('login admin OK', !!token);
  if (token) {
    const httpId = await mkProposal({});
    const c1 = await fetch(`${API}/api/admin/proposals/${httpId}/confirm-info`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }
    });
    const b1 = await c1.json();
    check('HTTP admin confirm-info 200', c1.status === 200 && b1.success === true, `status=${c1.status}`);
    const r1b = await getRow(httpId);
    check('HTTP confirm set flag DB', !!r1b.info_completed_at);
    const c2 = await fetch(`${API}/api/admin/proposals/${httpId}/reopen-info`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }
    });
    const b2 = await c2.json();
    check('HTTP admin reopen-info 200', c2.status === 200 && b2.success === true, `status=${c2.status}`);
    const c3 = await fetch(`${API}/api/my-proposals/${httpId}/confirm-info`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }
    });
    check('my-route chan sua ho (404)', c3.status === 404, `status=${c3.status}`);
    const c4 = await fetch(`${API}/api/admin/proposals/${httpId}/extend-deadline`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ days: 0, hours: 5, reason: 'HTTP test mo rong' })
    });
    const b4 = await c4.json();
    check('HTTP admin extend-deadline 200', c4.status === 200 && b4.success === true, `status=${c4.status}`);
    const c5 = await fetch(`${API}/api/admin/proposals/${httpId}/extend-deadline`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ days: 0, hours: 0, reason: 'x' })
    });
    check('HTTP extend validate 400', c5.status === 400, `status=${c5.status}`);
  }

  await cleanup();
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => { console.error('FATAL', e.message); try { await cleanup(); } catch { /* silent */ } try { await pool.end(); } catch { /* silent */ } process.exit(2); });
