const { execSync } = require('child_process');
const API = 'http://localhost:3000/api';
const results = [];
const check = (name, ok, extra = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' | ' + extra : ''}`); };

const sql = (query) => execSync(
  `docker exec station-mysql mysql -u root -ppassword station_management --default-character-set=utf8mb4 -N -B -e "${query.replace(/"/g, '\\"')}"`,
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
).trim();

const login = async (email) => {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: '123456' })
  });
  const body = await res.json();
  if (!body.data || !body.data.token) throw new Error(`Login failed: ${email} ${body.message || ''}`);
  return body.data.token;
};

const req = async (method, path, token, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json };
};

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const uploadFile = async (token, name) => {
  const fd = new FormData();
  fd.append('file', new Blob([PNG], { type: 'image/png' }), name);
  const res = await fetch(`${API}/files/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const body = await res.json();
  const id = body.data && (body.data.id || (body.data.file && body.data.file.id));
  if (!id) throw new Error(`Upload failed: ${JSON.stringify(body).slice(0, 200)}`);
  return id;
};

const notifCount = async (token, type, entityId, dbg) => {
  const res = await req('GET', '/notifications?limit=100', token);
  const list = (res.body && res.body.data) || [];
  const n = list.filter((x) => x.type === type && Number(x.entity_id) === Number(entityId)).length;
  if (n === 0 && dbg) console.log(`  [dbg] ${type}/${entityId} HTTP=${res.status} rows=${list.length} total=${res.body && res.body.pagination && res.body.pagination.total} types=${[...new Set(list.map((x) => x.type))].join('|')} full=${JSON.stringify((res.body && (res.body.message || res.body.error)) || null).slice(0, 60)}`);
  return n;
};

const statusOf = (id) => sql(`SELECT status FROM station_proposals WHERE id=${id}`);
const requestsOf = (id) => sql(`SELECT CONCAT(request_type, '|', status, '|', round_no, '|', IFNULL(target_user_id, 'null')) FROM proposal_requests WHERE proposal_id=${id} ORDER BY id`)
  .split('\n').filter(Boolean);
const logsOf = (id) => sql(`SELECT action FROM proposal_activity_logs WHERE proposal_id=${id} ORDER BY id`)
  .split('\n').filter(Boolean);

const createdProposalIds = [];
const createProposal = async (tag, withDocs) => {
  // Tạo nhanh (form 17) -> PENDING, rồi "Xác nhận đủ thông tin" -> GRADING (entry-flow đã xác thực)
  const payload = {
    latitude: 21.0285 + Math.random() * 0.02,
    longitude: 105.8542 + Math.random() * 0.02,
    province: 'Hà Nội',
    mo_hinh_dau_tu: 'NQ',
    owner_name: `Flow ${tag}`,
    owner_phone: '0987654321',
    address: `Số ${Math.floor(Math.random() * 100)} Flow ${tag}, Hoàn Kiếm, Hà Nội`,
    description: `Full flow test ${tag}`
  };
  const res = await req('POST', '/proposals?formId=17', tokens.ctv, payload);
  const id = res.body && res.body.data && res.body.data.id;
  if (!id) throw new Error(`createProposal ${tag} failed: HTTP ${res.status} ${res.body && res.body.message}`);
  if ((res.body.data.status || 'PENDING') !== 'PENDING') throw new Error(`createProposal ${tag}: expected PENDING, got ${res.body.data.status}`);
  const cf = await req('POST', `/my-proposals/${id}/confirm-info`, tokens.ctv, {});
  if (cf.status !== 200 || (cf.body.data && cf.body.data.status) !== 'GRADING') {
    throw new Error(`confirm-info ${tag} failed: HTTP ${cf.status} ${cf.body && cf.body.message}`);
  }
  createdProposalIds.push(id);
  if (withDocs) attachLegalDocsSql(id);
  return id;
};

const gradeQH = (id, score, note) => req('PUT', `/admin/proposal-grading/${id}`, tokens.qh, { quy_hoach_score: score, quy_hoach_note: note });
const gradePL = (id, score, note) => req('PUT', `/admin/proposal-grading/${id}`, tokens.pl, { phap_ly_score: score, phap_ly_note: note });

const attachLegalDocsSql = (id) => sql(
  `UPDATE station_proposals SET custom_data = JSON_SET(custom_data, ` +
  `'$.legal_document', JSON_ARRAY(JSON_OBJECT('id', ${fileIds.gcn}, 'original_name', 'flow-gcn.png')), ` +
  `'$.dkkd_cccd_hkd', JSON_ARRAY(JSON_OBJECT('id', ${fileIds.dkkd}, 'original_name', 'flow-dkkd.png'))) WHERE id=${id}`
);

const attachLegalDocs = async (id) => {
  const res = await req('PUT', `/admin/proposals/${id}`, tokens.admin, {
    legal_document: [{ id: fileIds.gcn }],
    dkkd_cccd_hkd: [{ id: fileIds.dkkd }]
  });
  const custom = sql(`SELECT JSON_EXTRACT(custom_data, '$.legal_document') FROM station_proposals WHERE id=${id}`);
  if (!custom || custom === 'NULL') {
    console.log('  (API attach không ghi custom_data — dùng SQL fallback)');
    attachLegalDocsSql(id);
  }
  return res.status;
};

const gradeTo = async (id, qhScore, plScore, withDocs = true) => {
  const r1 = await gradeQH(id, qhScore, `QH note ${qhScore}`);
  if (r1.status !== 200) throw new Error(`gradeQH ${id} HTTP ${r1.status}: ${r1.body && r1.body.message}`);
  const r2 = await gradePL(id, plScore, `PL note ${plScore}`);
  if (r2.status !== 200) throw new Error(`gradePL ${id} HTTP ${r2.status}: ${r2.body && r2.body.message}`);
  return statusOf(id);
};

const layoutApprove = async (id) => {
  const res = await req('PUT', `/admin/proposal-layouts/${id}`, tokens.qh, { files: [{ id: fileIds.layout }], approve: true });
  if (res.status !== 200) throw new Error(`layoutApprove ${id} HTTP ${res.status}: ${res.body && res.body.message}`);
  return statusOf(id);
};

const uploadReport = async (id, withChot = true, fileId = null) => {
  const body = { files: [{ id: fileId || fileIds.bcdx }] };
  if (withChot) body.chot_so_luong_tru = [{ mo_hinh: 'NQ', so_luong: 2, loai_tru: 'CCS2 120kW' }];
  const res = await req('POST', `/my-proposals/${id}/report`, tokens.ctv, body);
  return res;
};

const toReviewing = async (tag) => {
  const id = await createProposal(tag, true);
  await gradeTo(id, 3, 3);
  await layoutApprove(id);
  const rep = await uploadReport(id);
  if (rep.status !== 200) throw new Error(`uploadReport ${id} HTTP ${rep.status}: ${rep.body && rep.body.message}`);
  const st = statusOf(id);
  if (st !== 'PROPOSAL_REPORT_REVIEWING') throw new Error(`toReviewing ${id}: status=${st}`);
  return id;
};

const configureSignatures = async (id, gdId) => {
  const res = await req('PUT', `/admin/proposal-approvals/${id}/signature-config`, tokens.bo, {
    signers: [
      { user_id: 42, signer_title: 'Người đề xuất', page: 1, pos_x: 0.1, pos_y: 0.5 },
      { user_id: gdId ?? 40, signer_title: 'Giám đốc Trung tâm Kinh doanh', page: 1, pos_x: 0.45, pos_y: 0.5 }
    ]
  });
  if (res.status !== 200) throw new Error(`configureSignatures ${id} HTTP ${res.status}: ${res.body && res.body.message}`);
  return statusOf(id);
};

let tokens = {};
let fileIds = {};
let tempUserIds = [];
const stationsBefore = () => Number(sql('SELECT COUNT(*) FROM stations'));

const section = async (name, fn) => {
  console.log(`\n===== ${name} =====`);
  try {
    await fn();
  } catch (e) {
    check(`${name} (nhánh lỗi sớm)`, false, String(e.message || e).slice(0, 160));
  }
};

async function main() {
  console.log('--- SETUP ---');
  const mkUser = (email, name, dept, chucVu) => {
    sql(`DELETE FROM users WHERE email='${email}'`);
    sql(
      `INSERT INTO users (full_name, email, password, role, status, custom_data, token_version, created_at, updated_at) ` +
      `SELECT '${name}', '${email}', password, 'SALES', 'ACTIVE', JSON_OBJECT('department', '${dept}', 'chuc_vu', '${chucVu}'), 0, NOW(), NOW() FROM users WHERE email='ctv@gmail.com'`
    );
    return Number(sql(`SELECT id FROM users WHERE email='${email}'`));
  };
  const plId = mkUser('pl.flow@t.local', 'Trưởng phòng PL', 'Phòng Chiến lược KD', 'Trưởng phòng Chiến lược KD');
  const tgdId = mkUser('tgd.flow@t.local', 'Tổng giám đốc', 'Ban Giám đốc', 'Tổng giám đốc');
  const boId = mkUser('bo.flow@t.local', 'Back Office', 'Phòng Back Office', 'Trưởng phòng Back Office');
  const gdId = mkUser('gd.flow@t.local', 'Giám đốc TTKD miền Bắc', 'Trung tâm KD miền Bắc', 'Giám đốc Trung tâm Kinh doanh');
  tempUserIds = [plId, tgdId, boId, gdId];
  sql(`DELETE FROM signatures WHERE user_id=${gdId}; INSERT INTO signatures (user_id, file_path, file_url) SELECT ${gdId}, file_path, file_url FROM signatures WHERE user_id = 40;`);
  console.log('temp users:', tempUserIds.join(','));

  tokens = {
    ctv: await login('ctv@gmail.com'),
    qh: await login('qh@gmail.com'),
    pl: await login('pl.flow@t.local'),
    gd: await login('gd.flow@t.local'),
    tgd: await login('tgd.flow@t.local'),
    bo: await login('bo.flow@t.local'),
    admin: await login('admin@station.com')
  };
  fileIds = {
    gcn: await uploadFile(tokens.ctv, 'flow-gcn.png'),
    dkkd: await uploadFile(tokens.ctv, 'flow-dkkd.png'),
    layout: await uploadFile(tokens.ctv, 'flow-layout.png'),
    bcdx: await uploadFile(tokens.ctv, 'flow-bcdx.png'),
    bcdx2: await uploadFile(tokens.ctv, 'flow-bcdx-2.png'),
    signed: await uploadFile(tokens.ctv, 'flow-signed.png')
  };
  console.log('files:', JSON.stringify(fileIds));
  const stationCountBefore = stationsBefore();

  // ================= CHUỖI A — HAPPY PATH =================
  await section('A1. Tạo nhanh + Xác nhận đủ thông tin → GRADING', async () => {
    const id = await createProposal('A', false);
    check('A1 quick + confirm-info → GRADING', statusOf(id) === 'GRADING', statusOf(id));
    check('A1 log created', logsOf(id).includes('created'));
    check('A1 note = NO_QH_WAIT_PL', sql(`SELECT note FROM station_proposals WHERE id=${id}`) === 'NO_QH_WAIT_PL');
    check('A1 notify QH đúng 1 (không trùng)', (await notifCount(tokens.qh, 'GRADING', id)) === 1);
    check('A1 notify PL đúng 1 (không trùng)', (await notifCount(tokens.pl, 'GRADING', id)) === 1);
    global.__A = id;
  });

  await section('A2/A3. Chấm điểm QH + chặn PL thiếu hồ sơ + đủ hồ sơ', async () => {
    const id = global.__A;
    const qh = await gradeQH(id, 3, 'Vị trí phù hợp quy hoạch');
    check('A2 QH chấm 3 OK', qh.status === 200);
    check('A2 note = YES_QH_WAIT_PL', sql(`SELECT note FROM station_proposals WHERE id=${id}`) === 'YES_QH_WAIT_PL');
    const blocked = await gradePL(id, 3, 'x');
    check('A3 PL bị chặn khi thiếu hồ sơ (400)', blocked.status === 400, (blocked.body && blocked.message || '').slice(0, 80));
    await attachLegalDocs(id);
    const after = await gradePL(id, 3, 'Hồ sơ pháp lý đầy đủ');
    check('A3 PL chấm 3 sau khi có hồ sơ OK', after.status === 200, (after.body && after.body.message || '').slice(0, 80));
    check('A4 tổng 6 → DESIGNING tự động', statusOf(id) === 'DESIGNING', statusOf(id));
    check('A4 log grading_updated + status_change', logsOf(id).includes('grading_updated') && logsOf(id).includes('status_change'));
    check('A4 notify DESIGNING cho QH đúng 1', (await notifCount(tokens.qh, 'DESIGNING', id)) === 1);
  });

  await section('A5. Layout — upload + duyệt', async () => {
    const id = global.__A;
    const noApprove = await req('PUT', `/admin/proposal-layouts/${id}`, tokens.qh, { files: [{ id: fileIds.layout }] });
    check('A5 lưu layout chưa duyệt OK', noApprove.status === 200);
    check('A5 vẫn DESIGNING khi chưa approve', statusOf(id) === 'DESIGNING');
    const app = await req('PUT', `/admin/proposal-layouts/${id}`, tokens.qh, { files: [{ id: fileIds.layout }], approve: true });
    check('A5 duyệt layout → PROPOSAL_REPORT_CREATING', app.status === 200 && statusOf(id) === 'PROPOSAL_REPORT_CREATING', statusOf(id));
    check('A5 log layout_approved', logsOf(id).includes('layout_approved'));
    check('A5 notify GĐTTKD vùng đúng 1 (không trùng)', (await notifCount(tokens.gd, 'PROPOSAL_REPORT_CREATING', id)) === 1);
  });

  await section('A6. Lập tờ trình BCĐX — bảng trụ chốt bắt buộc', async () => {
    const id = global.__A;
    const bad = await uploadReport(id, false);
    check('A6 thiếu bảng trụ chốt → 400', bad.status === 400, (bad.body && bad.body.message || '').slice(0, 80));
    const badTru = await req('POST', `/my-proposals/${id}/report`, tokens.ctv, {
      files: [{ id: fileIds.bcdx }],
      chot_so_luong_tru: [{ mo_hinh: 'NQ', so_luong: 2, loai_tru: 'Trụ không tồn tại' }]
    });
    check('A6 loại trụ không có giá → 400', badTru.status === 400, (badTru.body && badTru.message || '').slice(0, 60));
    const ok = await uploadReport(id, true);
    check('A6 upload BCĐX → PROPOSAL_REPORT_REVIEWING', ok.status === 200 && statusOf(id) === 'PROPOSAL_REPORT_REVIEWING', statusOf(id));
    const chot = sql(`SELECT chot_so_luong_tru, tong_gia_tri_chot FROM station_proposals WHERE id=${id}`);
    check('A6 tổng giá trị chốt = 2 × 290tr = 580tr', chot.includes('580000000'), chot.slice(0, 80));
    check('A6 log report_uploaded', logsOf(id).includes('report_uploaded'));
    check('A6 notify Back Office đúng 1', (await notifCount(tokens.bo, 'PROPOSAL_REPORT_REVIEWING', id)) === 1);
  });

  await section('A7. Duyệt BCĐX — cấu hình ký', async () => {
    const id = global.__A;
    const cand = await req('GET', `/admin/proposal-approvals/${id}/signer-candidates`, tokens.admin);
    const list = (cand.body && cand.body.data) || [];
    const candIds = (Array.isArray(list) ? list : (list.candidates || [])).map((c) => Number(c.id || c.user_id));
    check('A7 candidates gồm owner(42) + GĐTTKD vùng + TGĐ', [42, tempUserIds[3], tempUserIds[1]].every((u) => candIds.includes(u)), candIds.join(','));
    const cfg = await configureSignatures(id, tempUserIds[3]);
    check('A7 cấu hình ký → SIGNATURE_PENDING', cfg === 'SIGNATURE_PENDING', cfg);
    const nConfigs = Number(sql(`SELECT COUNT(*) FROM proposal_signature_configs WHERE proposal_id=${id} AND status='PENDING'`));
    check('A7 2 ô ký PENDING', nConfigs === 2, String(nConfigs));
    check('A7 log signature_configured', logsOf(id).includes('signature_configured'));
    check('A7 notify người ký (ctv: chủ đề xuất luôn nhận thông báo trung tâm + 1 thông báo signer)', (await notifCount(tokens.ctv, 'SIGNATURE_PENDING', id)) >= 1);
    check('A7 notify người ký đúng 1 (GĐTTKD)', (await notifCount(tokens.gd, 'SIGNATURE_PENDING', id)) === 1);
  });

  await section('A8. Trình ký — ký + upload file chốt', async () => {
    const id = global.__A;
    const s1 = await req('POST', `/admin/proposal-signatures/${id}/sign`, tokens.ctv, {});
    check('A8 ctv ký OK', s1.status === 200);
    const boTry = await req('POST', `/admin/proposal-signatures/${id}/signed-file`, tokens.bo, { files: [{ id: fileIds.signed }] });
    check('A8 upload file chốt khi chưa đủ chữ ký → 400', boTry.status === 400, (boTry.body && boTry.body.message || '').slice(0, 60));
    const s2 = await req('POST', `/admin/proposal-signatures/${id}/sign`, tokens.gd, {});
    check('A8 GĐTTKD ký OK', s2.status === 200, (s2.body && s2.body.message || '').slice(0, 60));
    check('A8 cả 2 ô ký đã SIGNED', Number(sql(`SELECT COUNT(*) FROM proposal_signature_configs WHERE proposal_id=${id} AND status='SIGNED'`)) === 2);
    const up = await req('POST', `/admin/proposal-signatures/${id}/signed-file`, tokens.bo, { files: [{ id: fileIds.signed }] });
    check('A8 Back Office upload file chốt → COMPLETED', up.status === 200 && statusOf(id) === 'COMPLETED', statusOf(id));
    check('A8 signed_file_id đã lưu', sql(`SELECT IFNULL(signed_file_id, 0) FROM station_proposals WHERE id=${id}`) !== '0');
    check('A8 log signature_signed + signed_file_uploaded', logsOf(id).includes('signature_signed') && logsOf(id).includes('signed_file_uploaded'));
  });

  await section('A9. COMPLETED — không tự tạo trạm', async () => {
    const id = global.__A;
    const after = stationsBefore();
    check('A9 số trạm không tăng (COMPLETED không tự tạo)', after === stationCountBefore, `${stationCountBefore} → ${after}`);
    const tab = await req('GET', '/admin/proposals?statuses=COMPLETED,CANCELLED&limit=50', tokens.admin);
    const rows = (tab.body && tab.body.data) || [];
    check('A9 xuất hiện trong tab Đề xuất đã hoàn thành', rows.some((r) => Number(r.id) === Number(id)));
  });

  // ================= NHÁNH B =================
  await section('B1. Điểm 0 → hủy ngay', async () => {
    const id = await createProposal('B1', true);
    const r = await gradeQH(id, 0, 'Vi phạm quy hoạch');
    check('B1 QH chấm 0 → CANCELLED ngay (không chờ PL)', statusOf(id) === 'CANCELLED', statusOf(id));
    check('B1 reject_reason tự động "Điểm Quy hoạch bằng 0"', sql(`SELECT reject_reason FROM station_proposals WHERE id=${id}`).includes('bằng 0'));
    check('B1 notify CANCELLED cho GĐTTKD vùng', (await notifCount(tokens.gd, 'CANCELLED', id)) >= 1);
  });

  await section('B2-B3-B4. Tổng 2-3 → GĐTTKD → chấm lại → trình TGĐ → TGĐ duyệt', async () => {
    const id = await createProposal('B2', true);
    const st1 = await gradeTo(id, 1, 1);
    check('B2 tổng 2 → GDTTKD_EVALUATING', st1 === 'GDTTKD_EVALUATING', st1);
    check('B2 sinh request RE_GRADE mở', requestsOf(id).some((r) => r.startsWith('RE_GRADE|OPEN|')), requestsOf(id).join(' ; '));
    check('B2 notify GĐTTKD vùng đúng 1', (await notifCount(tokens.gd, 'GDTTKD_EVALUATING', id)) === 1);

    const rg = await req('PUT', `/admin/proposal-reviews/${id}/request-regrade`, tokens.gd, { reason: 'Cần xem xét lại điểm QH-PL' });
    check('B3 GĐTTKD yêu cầu chấm lại → RE_GRADING', rg.status === 200 && statusOf(id) === 'RE_GRADING', statusOf(id));
    check('B3 review_level=2', sql(`SELECT IFNULL(review_level, 0) FROM station_proposals WHERE id=${id}`) === '2');
    const rgRequests = requestsOf(id).filter((r) => r.startsWith('RE_GRADE'));
    check('B3 request RE_GRADE mới mở (note \"Lần chấm lại: 1\")', rgRequests.some((r) => r.startsWith('RE_GRADE|OPEN|')), rgRequests.join(' ; '));
    check('B3 notify PL nhận việc chấm lại (qh là ADMIN nên notify theo phòng chỉ gửi người không phải ADMIN)', (await notifCount(tokens.pl, 'RE_GRADING', id)) >= 1);

    const st2 = await gradeTo(id, 1, 1);
    check('B3 chấm lại tổng 2 → RE_GDTTKD_EVALUATING', st2 === 'RE_GDTTKD_EVALUATING', st2);
    check('B3 mọi request RE_GRADE đã đóng', rgRequests.length >= 2 && requestsOf(id).every((r) => {
      const open = r.startsWith('RE_GRADE|OPEN|');
      return !open;
    }), requestsOf(id).join(' ; '));

    const tg = await req('PUT', `/admin/proposal-reviews/${id}/to-tgd`, tokens.gd, { reason: 'Trình TGĐ xem xét' });
    check('B4 trình TGĐ → TGD_REVIEW + review_level=3', tg.status === 200 && statusOf(id) === 'TGD_REVIEW' && sql(`SELECT review_level FROM station_proposals WHERE id=${id}`) === '3', statusOf(id));
    check('B4 sinh request TGD_REVIEW', requestsOf(id).some((r) => r.startsWith('TGD_REVIEW|OPEN|1|')), requestsOf(id).join(' ; '));
    const ap = await req('PUT', `/admin/proposal-reviews/${id}/approve`, tokens.tgd, { reason: 'Đồng ý vị trí này' });
    check('B4 TGĐ duyệt → DESIGNING', ap.status === 200 && statusOf(id) === 'DESIGNING', statusOf(id));
    check('B4 request TGD_REVIEW đóng', requestsOf(id).some((r) => r.startsWith('TGD_REVIEW|DONE|1|')), requestsOf(id).join(' ; '));
  });

  await section('B4b. TGĐ không duyệt (qua vòng chấm lại) → CANCELLED', async () => {
    const id = await createProposal('B4b', true);
    await gradeTo(id, 1, 1);
    await req('PUT', `/admin/proposal-reviews/${id}/request-regrade`, tokens.gd, { reason: 'Chấm lại lần 1' });
    const st = await gradeTo(id, 1, 2);
    check('B4b vòng chấm lại → RE_GDTTKD_EVALUATING', st === 'RE_GDTTKD_EVALUATING', st);
    const tg = await req('PUT', `/admin/proposal-reviews/${id}/to-tgd`, tokens.gd, { reason: 'Trình TGĐ' });
    check('B4b vào TGD_REVIEW', tg.status === 200 && statusOf(id) === 'TGD_REVIEW');
    const rj = await req('PUT', `/admin/proposal-reviews/${id}/reject`, tokens.tgd, { reason: 'Vị trí chưa phù hợp' });
    check('B4b TGĐ không duyệt → CANCELLED', rj.status === 200 && statusOf(id) === 'CANCELLED', statusOf(id));
  });

  await section('B3b. GĐTTKD xác nhận hủy → CANCELLED', async () => {
    const id = await createProposal('B3b', true);
    await gradeTo(id, 1, 1);
    const cc = await req('PUT', `/admin/proposal-reviews/${id}/cancel`, tokens.gd, { reason: 'Khách hàng không hợp tác' });
    check('B3b GĐTTKD hủy → CANCELLED', cc.status === 200 && statusOf(id) === 'CANCELLED', statusOf(id));
  });

  await section('B5. Layout — hủy bỏ', async () => {
    const id = await createProposal('B5', true);
    await gradeTo(id, 3, 3);
    const cc = await req('PUT', `/admin/proposal-layouts/${id}/cancel`, tokens.qh, { reason: 'Không thể dựng layout tại đây' });
    check('B5 hủy layout → CANCELLED', cc.status === 200 && statusOf(id) === 'CANCELLED', statusOf(id));
    check('B5 log layout_cancelled', logsOf(id).includes('layout_cancelled'));
  });

  await section('B6. Layout — yêu cầu bổ sung → owner sửa → về DESIGNING', async () => {
    const id = await createProposal('B6', true);
    await gradeTo(id, 3, 3);
    const sp = await req('PUT', `/admin/proposal-layouts/${id}/request-supplement`, tokens.qh, { description: 'Cần thêm ảnh mặt bằng rộng' });
    check('B6 yêu cầu bổ sung → INFOR_WAITING', sp.status === 200 && statusOf(id) === 'INFOR_WAITING', statusOf(id));
    check('B6 sinh request LAYOUT_SUPPLEMENT target owner', requestsOf(id).some((r) => r.startsWith('LAYOUT_SUPPLEMENT|OPEN|1|42')), requestsOf(id).join(' ; '));
    check('B6 notify owner nhận yêu cầu', (await notifCount(tokens.ctv, 'INFOR_WAITING', id)) === 1);
    const edit = await req('PUT', `/my-proposals/${id}`, tokens.ctv, {
      owner_name: 'Flow B6',
      owner_phone: '0987654321',
      address: 'Số 99 B6 updated, Hoàn Kiếm, Hà Nội'
    });
    check('B6 owner sửa ở INFOR_WAITING → tự về DESIGNING', edit.status === 200 && statusOf(id) === 'DESIGNING', `${edit.status} ${statusOf(id)} ${edit.body && edit.body.message || ''}`.slice(0, 100));
    check('B6 request LAYOUT_SUPPLEMENT đóng', requestsOf(id).some((r) => r.startsWith('LAYOUT_SUPPLEMENT|DONE|1|')), requestsOf(id).join(' ; '));
  });

  await section('B7. Lập tờ trình — yêu cầu tạo lại → owner đẩy lại', async () => {
    const id = await createProposal('B7', true);
    await gradeTo(id, 3, 3);
    await layoutApprove(id);
    await uploadReport(id, true);
    const rv = await req('PUT', `/admin/proposal-reports/${id}/request-revision`, tokens.bo, { description: 'Thiếu chữ ký số bên phải' });
    check('B7 yêu cầu sửa BCĐX → PROPOSAL_REPORT_RE_CREATING', rv.status === 200 && statusOf(id) === 'PROPOSAL_REPORT_RE_CREATING', statusOf(id));
    check('B7 sinh request REVISE_BCDX', requestsOf(id).some((r) => r.startsWith('REVISE_BCDX|OPEN|')), requestsOf(id).join(' ; '));
    const re = await uploadReport(id, true, fileIds.bcdx2);
    check('B7 owner đẩy lại file mới → PROPOSAL_REPORT_REVIEWING', re.status === 200 && statusOf(id) === 'PROPOSAL_REPORT_REVIEWING', `${re.status} / ${statusOf(id)} ${(re.body && re.body.message || '').slice(0, 60)}`);
    check('B7 request REVISE_BCDX đóng', requestsOf(id).some((r) => r.startsWith('REVISE_BCDX|DONE|')), requestsOf(id).join(' ; '));
    check('B7 log report_revision_requested', logsOf(id).includes('report_revision_requested'));
  });

  // ================= NHÁNH C/D =================
  await section('C1. Duyệt BCĐX — yêu cầu cập nhật thông tin + vòng lặp', async () => {
    const id = await toReviewing('C1');
    const ru = await req('PUT', `/admin/proposal-approvals/${id}/request-update`, tokens.bo, { description: 'Bổ sung chi phí vận hành' });
    check('C1 yêu cầu cập nhật → PROPOSAL_REPORT_UPDATING', ru.status === 200 && statusOf(id) === 'PROPOSAL_REPORT_UPDATING', statusOf(id));
    check('C1 sinh request UPDATE_INFO', requestsOf(id).some((r) => r.startsWith('UPDATE_INFO|OPEN|')), requestsOf(id).join(' ; '));
    check('C1 notify owner (PROPOSAL_REPORT_UPDATING)', (await notifCount(tokens.ctv, 'PROPOSAL_REPORT_UPDATING', id)) >= 1);
    const re = await uploadReport(id, true, fileIds.bcdx2);
    check('C1 owner cập nhật lại file mới → PROPOSAL_REPORT_REVIEWING', re.status === 200 && statusOf(id) === 'PROPOSAL_REPORT_REVIEWING', `${re.status} / ${statusOf(id)} ${(re.body && re.body.message || '').slice(0, 60)}`);
    check('C1 request UPDATE_INFO đóng', requestsOf(id).some((r) => r.startsWith('UPDATE_INFO|DONE|')), requestsOf(id).join(' ; '));
    check('C1 log report_update_requested', logsOf(id).includes('report_update_requested'));
  });

  await section('C2. Duyệt BCĐX — TGĐ chỉ đọc + từ chối duyệt', async () => {
    const id = await toReviewing('C2');
    const list = await req('GET', '/admin/proposal-approvals?tab=all&limit=50', tokens.tgd);
    const meta = (list.body && list.body.meta) || {};
    check('C2 TGĐ meta.roleKey=TGD (FE ẩn nút theo meta này)', meta.roleKey === 'TGD' && !meta.isAdmin, JSON.stringify(meta).slice(0, 60));
    const cfgTry = await req('PUT', `/admin/proposal-approvals/${id}/signature-config`, tokens.tgd, {
      signers: [{ user_id: 42, page: 1, pos_x: 0.1, pos_y: 0.5 }]
    });
    check('C2 TGĐ không được cấu hình ký (403)', cfgTry.status === 403, `HTTP ${cfgTry.status}`);
    const rj = await req('PUT', `/admin/proposal-approvals/${id}/tgd-reject`, tokens.tgd, { reason: 'Nội dung BCĐX chưa thuyết phục' });
    check('C2 TGĐ từ chối duyệt → PROPOSAL_REPORT_UPDATING', rj.status === 200 && statusOf(id) === 'PROPOSAL_REPORT_UPDATING', statusOf(id));
    check('C2 sinh request REVISE_BCDX', requestsOf(id).some((r) => r.startsWith('REVISE_BCDX|OPEN|')), requestsOf(id).join(' ; '));
    check('C2 log report_tgd_rejected', logsOf(id).includes('report_tgd_rejected'));
    check('C2 notify owner nhận lý do', (await notifCount(tokens.ctv, 'PROPOSAL_REPORT_UPDATING', id)) >= 1);
  });

  await section('D1. Trình ký — từ chối duyệt → yêu cầu bổ sung', async () => {
    const id = await toReviewing('D1');
    await configureSignatures(id);
    check('D1 vào SIGNATURE_PENDING', statusOf(id) === 'SIGNATURE_PENDING', statusOf(id));
    const rj = await req('POST', `/admin/proposal-signatures/${id}/reject`, tokens.tgd, { reason: 'Cần bổ sung bảng chi phí' });
    check('D1 TGĐ từ chối ký → PROPOSAL_REPORT_UPDATING', rj.status === 200 && statusOf(id) === 'PROPOSAL_REPORT_UPDATING', statusOf(id));
    check('D1 sinh request REVISE_BCDX', requestsOf(id).some((r) => r.startsWith('REVISE_BCDX|OPEN|')), requestsOf(id).join(' ; '));
    check('D1 log signature_rejected', logsOf(id).includes('signature_rejected'));
    check('D1 notify owner', (await notifCount(tokens.ctv, 'PROPOSAL_REPORT_UPDATING', id)) >= 1);
  });

  await section('X. Tab "Đề xuất cần thực hiện" (my=1) đúng vai trò', async () => {
    const x1 = await createProposal('X1', true);
    const st = await gradeTo(x1, 1, 1);
    check('X0 X1 vào GDTTKD_EVALUATING (RE_GRADE còn mở)', st === 'GDTTKD_EVALUATING', st);
    const inRun = (rows) => rows.filter((r) => createdProposalIds.includes(Number(r.proposal_id)));

    const mineQH = await req('GET', '/admin/proposal-requests?status=OPEN&my=1&limit=50', tokens.qh);
    const qhRows = inRun((mineQH.body && mineQH.body.data) || []);
    check('X1 QH my=1 chỉ thấy việc giao cho mình (RE_GRADE)', qhRows.length >= 1 && qhRows.every((r) => r.request_type === 'RE_GRADE'), qhRows.map((r) => `${r.proposal_id}:${r.request_type}`).join(','));
    check('X1 QH my=1 thấy việc của X1', qhRows.some((r) => Number(r.proposal_id) === Number(x1)));

    const mineBO = await req('GET', '/admin/proposal-requests?status=OPEN&my=1&limit=50', tokens.bo);
    const boRows = inRun((mineBO.body && mineBO.body.data) || []);
    check('X2 Back Office my=1 không thấy việc ngoài scope/loại của mình', boRows.every((r) => r.request_type !== 'RE_GRADE'), boRows.map((r) => `${r.proposal_id}:${r.request_type}`).join(','));

    const mineTGD = await req('GET', '/admin/proposal-requests?status=OPEN&my=1&limit=50', tokens.tgd);
    const tgdRows = inRun((mineTGD.body && mineTGD.body.data) || []);
    check('X3 TGĐ my=1 không thấy việc theo loại khi ngoài scope (SALES không phái nhánh — ghi nhận docs)', tgdRows.length === 0, tgdRows.map((r) => `${r.proposal_id}:${r.request_type}:${r.target_user_id}`).join(','));

    const mineCTV = await req('GET', '/admin/proposal-requests?status=OPEN&my=1&limit=50', tokens.ctv);
    const ctvRows = inRun((mineCTV.body && mineCTV.body.data) || []);
    check('X4 CTV my=1 chỉ thấy việc target mình (REVISE_BCDX từ D1)', ctvRows.length === 1 && ctvRows[0].request_type === 'REVISE_BCDX' && !!ctvRows[0].target_user_name, ctvRows.map((r) => `${r.proposal_id}:${r.request_type}:${r.target_user_name}`).join(','));
  });

  // ================= CLEANUP =================
  console.log('\n--- CLEANUP ---');
  if (createdProposalIds.length > 0) {
    const ids = createdProposalIds.join(',');
    sql(`DELETE FROM proposal_requests WHERE proposal_id IN (${ids})`);
    sql(`DELETE FROM proposal_activity_logs WHERE proposal_id IN (${ids})`);
    sql(`DELETE FROM proposal_signature_configs WHERE proposal_id IN (${ids})`);
    sql(`DELETE FROM notifications WHERE entity_type='station_proposals' AND entity_id IN (${ids})`);
    sql(`DELETE FROM journey_activity_logs WHERE entity_type='proposal' AND entity_id IN (${ids})`);
    sql(`DELETE FROM station_proposals WHERE id IN (${ids})`);
    console.log(`đã dọn ${createdProposalIds.length} đề xuất test`);
  }
  for (const uid of tempUserIds) {
    sql(`DELETE FROM signatures WHERE user_id=${uid}`);
    sql(`DELETE FROM notifications WHERE user_id=${uid}`);
    sql(`DELETE FROM users WHERE id=${uid}`);
  }
  const fileDel = Object.values(fileIds).join(',');
  if (fileDel) sql(`UPDATE files SET status='deleted' WHERE id IN (${fileDel})`);
  console.log('đã dọn user tạm + file tạm');

  console.log(`\n${results.filter(Boolean).length}/${results.length} PASS`);
}

main().catch(async (e) => {
  console.error('FATAL:', e);
  try {
    if (createdProposalIds.length > 0) {
      const ids = createdProposalIds.join(',');
      sql(`DELETE FROM proposal_requests WHERE proposal_id IN (${ids}); DELETE FROM proposal_activity_logs WHERE proposal_id IN (${ids}); DELETE FROM proposal_signature_configs WHERE proposal_id IN (${ids}); DELETE FROM notifications WHERE entity_type='station_proposals' AND entity_id IN (${ids}); DELETE FROM journey_activity_logs WHERE entity_type='proposal' AND entity_id IN (${ids}); DELETE FROM station_proposals WHERE id IN (${ids});`);
    }
    for (const uid of tempUserIds) sql(`DELETE FROM signatures WHERE user_id=${uid}`);
    for (const uid of tempUserIds) sql(`DELETE FROM users WHERE id=${uid}`);
  } catch { /* best effort */ }
  process.exit(1);
});
