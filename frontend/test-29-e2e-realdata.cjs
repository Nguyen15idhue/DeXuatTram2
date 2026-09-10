const { chromium } = require('playwright');
const { execFileSync } = require('child_process');

const BASE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const CONFIG_ID = 3;
const TS = Date.now();
const PROPOSAL_A_OWNER = `P29E2E_PUSH_${TS}`;
const PROPOSAL_B_OWNER = `P29E2E_LINK_${TS}`;

const ketQua = [];
const ghi = (ten, ok, chiTiet = '') => {
  ketQua.push({ ten, ok, chiTiet });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${ten}${chiTiet ? ' - ' + chiTiet : ''}`);
};

const mysqlArgs = ['exec', '-i', 'station-mysql', 'mysql', '-uroot', '-ppassword', '--default-character-set=utf8mb4', 'station_management'];
const chaySql = (q) => execFileSync('docker', mysqlArgs, { input: q, encoding: 'utf8' });
const chayNodeContainer = (code) => execFileSync('docker', ['exec', 'station-backend', 'node', '-e', code], { encoding: 'utf8' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function doi(fn, timeoutMs = 60000, buocMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await sleep(buocMs);
  }
  return null;
}

async function layProposal(token, owner) {
  const res = await fetch(`${API}/api/admin/proposals?search=${encodeURIComponent(owner)}&limit=5`, {
    headers: { Authorization: 'Bearer ' + token }
  }).then(r => r.json());
  return (res.data || [])[0] || null;
}

function taoProposalSql(owner, filesJson) {
  const out = chaySql(
    `INSERT INTO station_proposals (user_id, latitude, longitude, owner_name, owner_phone, address, area, land_type, description, status, custom_data)
     VALUES (1, 10.123456, 106.123456, '${owner}', '0900000029', 'P29 E2E address', '', '', 'p29 e2e', 'PENDING', ${filesJson ? `CAST('{"site_images": ${filesJson}}' AS JSON)` : 'NULL'});
     SELECT LAST_INSERT_ID() AS id;`
  );
  const lines = out.trim().split(/\r?\n/).filter(Boolean);
  const soCuoi = lines[lines.length - 1].split('\t');
  return parseInt(soCuoi[soCuoi.length - 1], 10);
}

async function main() {
  const dangNhap = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@station.com', password: '123456' })
  }).then(r => r.json());
  const token = dangNhap.data?.token;

  // Lấy 1 contact có sẵn để test link
  const timContact = await fetch(`${API}/api/admin/1office/contacts/search?configId=${CONFIG_ID}&q=1office`, {
    headers: { Authorization: 'Bearer ' + token }
  }).then(r => r.json());
  const contactMau = (timContact.data?.contacts || [])[0];
  ghi('Lấy được contact mẫu để link', !!contactMau, contactMau ? `code=${contactMau.code}` : 'không có');

  // Tạo proposal A (push, có 2 file) và B (link)
  const dsFile = [
    { id: 9201, name: 'e2e_a1.docx', original_name: 'e2e_a1.docx', storage_key: 'general/05-09-2026/1788590776733-elasisgdcgs.docx', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 15848, status: 'active' },
    { id: 9202, name: 'e2e_a2.jpeg', original_name: 'e2e_a2.jpeg', storage_key: 'general/05-09-2026/1788590802825-dclg80f0oet.jpeg', mime_type: 'image/jpeg', size: 885866, status: 'active' }
  ];
  const idA = taoProposalSql(PROPOSAL_A_OWNER, JSON.stringify(dsFile));
  const idB = taoProposalSql(PROPOSAL_B_OWNER, null);
  ghi('Tạo proposal test A/B', idA > 0 && idB > 0, `A=${idA} B=${idB}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const loiConsole = [];
  page.on('pageerror', e => loiConsole.push(String(e).slice(0, 120)));

  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'admin@station.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  const oTim = 'input[placeholder*="mã đề xuất"]';

  // ===== PUSH =====
  await page.goto(`${BASE}/admin/proposals`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.fill(oTim, PROPOSAL_A_OWNER);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  const hangA = page.locator('tr', { hasText: PROPOSAL_A_OWNER });
  ghi('Tìm thấy proposal A trên UI', await hangA.count() > 0);
  await hangA.locator('input[type="checkbox"]').check();
  await page.waitForTimeout(500);
  await page.locator('button[title="Thao tác"]').click();
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Đẩy sang 1Office")').click();
  await page.waitForTimeout(2000);
  const aSauPush = await doi(async () => {
    const p = await layProposal(token, PROPOSAL_A_OWNER);
    return p && p.contact_1office_code ? p : null;
  }, 60000, 2000);
  ghi('PUSH: proposal A được tạo contact 1Office', !!aSauPush, aSauPush ? `code=${aSauPush.contact_1office_code} sync=${aSauPush.sync_status}` : 'timeout');
  const codeA = aSauPush ? aSauPush.contact_1office_code : null;

  if (codeA) {
    const raw = chayNodeContainer(`const o=require('/app/src/services/oneOfficeService');o.getContactDetail(${CONFIG_ID},'${codeA}').then(r=>{const i=r.data&&(r.data.data||r.data);console.log(JSON.stringify({name:i&&i.name,phones:i&&i.phones,address:i&&i.address,soFile:(i&&i.files||[]).length,tenFile:(i&&i.files||[]).map(f=>f.filename||f.title)}))}).then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})`);
    let det = null;
    try { det = JSON.parse(raw.trim().split(/\r?\n/).pop()); } catch { /* ignore */ }
    ghi('PUSH: contact 1Office có tên', !!(det && det.name), JSON.stringify(det && { name: det.name, phones: det.phones, address: det.address }));
    ghi('PUSH: contact 1Office nhận đủ 2 file', !!(det && det.soFile === 2), det ? `soFile=${det.soFile}` : 'không đọc được');
  }

  // Push lại -> không nhân đôi file
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.fill(oTim, PROPOSAL_A_OWNER);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  const hangA2 = page.locator('tr', { hasText: PROPOSAL_A_OWNER });
  await hangA2.locator('input[type="checkbox"]').check();
  await page.waitForTimeout(500);
  await page.locator('button[title="Thao tác"]').click();
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Đẩy sang 1Office")').click();
  await page.waitForTimeout(6000);
  if (codeA) {
    const raw2 = chayNodeContainer(`const o=require('/app/src/services/oneOfficeService');o.getContactDetail(${CONFIG_ID},'${codeA}').then(r=>{const i=r.data&&(r.data.data||r.data);console.log((i&&i.files||[]).length)}).then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})`);
    const soSau = parseInt(raw2.trim().split(/\r?\n/).pop(), 10);
    ghi('PUSH lại (không thêm file): không nhân đôi file', soSau === 2, `soFile=${soSau}`);
  }

  // ===== LINK =====
  await page.goto(`${BASE}/admin/proposals`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.fill(oTim, PROPOSAL_B_OWNER);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  const hangB = page.locator('tr', { hasText: PROPOSAL_B_OWNER });
  ghi('Tìm thấy proposal B trên UI', await hangB.count() > 0);
  await hangB.locator('button:has-text("Link")').first().click();
  await page.waitForTimeout(1000);
  await page.fill('input[placeholder*="Nhập mã contact"]', contactMau.code);
  await page.locator('button:has-text("Liên kết")').click();
  await page.waitForTimeout(2000);
  const bSauLink = await doi(async () => {
    const p = await layProposal(token, PROPOSAL_B_OWNER);
    return p && p.contact_1office_code ? p : null;
  }, 30000, 2000);
  ghi('LINK: proposal B được gắn contact', !!bSauLink && bSauLink.contact_1office_code === contactMau.code, bSauLink ? `code=${bSauLink.contact_1office_code}` : 'timeout');

  // ===== UNLINK =====
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.fill(oTim, PROPOSAL_B_OWNER);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  const hangB2 = page.locator('tr', { hasText: PROPOSAL_B_OWNER });
  await hangB2.locator('button:has-text("Hủy link")').first().click();
  await page.waitForTimeout(2000);
  const bSauUnlink = await doi(async () => {
    const p = await layProposal(token, PROPOSAL_B_OWNER);
    return p && !p.contact_1office_code ? p : null;
  }, 30000, 2000);
  ghi('UNLINK: proposal B gỡ contact', !!bSauUnlink, bSauUnlink ? `code=${bSauUnlink.contact_1office_code || 'null'}` : 'timeout');

  // ===== PULL =====
  await page.goto(`${BASE}/admin/proposals`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.locator('button[title="Thao tác"]').click();
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Lấy về từ 1Office")').click();
  await page.waitForTimeout(2000);
  const jobPull = await doi(async () => {
    const res = await fetch(`${API}/api/admin/queue-logs?action=pull&limit=5`, { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
    const list = res.data || res.jobs || [];
    const j = list.find(x => x.action === 'pull' && x.status === 'completed');
    return j || null;
  }, 90000, 3000);
  ghi('PULL: job lấy về hoàn thành', !!jobPull, jobPull ? `job#${jobPull.id}` : 'timeout');

  ghi('Không lỗi console', loiConsole.length === 0, loiConsole.join(' | ').slice(0, 150));
  await browser.close();

  // ===== CLEANUP =====
  if (codeA) {
    try { chayNodeContainer(`require('/app/src/services/oneOfficeService').deleteContact(${CONFIG_ID},['${codeA}']).then(()=>process.exit(0)).catch(()=>process.exit(0))`); } catch { /* ignore */ }
  }
  chaySql(`DELETE FROM station_proposals WHERE id IN (${idA}, ${idB});`);
  ghi('Dọn dẹp dữ liệu test', true, `đã xóa contact ${codeA || 'n/a'} + proposal A/B`);

  const thatBai = ketQua.filter(x => !x.ok);
  console.log(`\nTỔNG ${ketQua.length}, THẤT BẠI ${thatBai.length}`);
  require('fs').writeFileSync('test-29-e2e-realdata-results.json', JSON.stringify(ketQua, null, 2));
  process.exit(thatBai.length ? 1 : 0);
}

main().catch(e => { console.error('LỖI', e); process.exit(1); });
