const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const XLSX = require('xlsx');

const BASE = process.env.CUSTOMER_TABS_BASE_URL || 'http://localhost:5173';
const prefix = `customer-tabs-${crypto.randomUUID()}`;
const password = crypto.randomBytes(24).toString('hex');
const runFixture = (action) => JSON.parse(execFileSync('docker',
  ['exec', '-i', '-w', '/app', 'station-backend', 'node'], {
    encoding: 'utf8',
    input: `
const pool = require('./src/utils/db');
(async () => {
  const prefix = ${JSON.stringify(prefix)};
  const users = [];
  const department = 'Trung tâm KD miền Bắc';
  try {
    if (${JSON.stringify(action)} === 'cleanup') {
      const [leads] = await pool.query('SELECT id, journey_id FROM leads WHERE full_name LIKE ?', [prefix + '%']);
      if (leads.length) {
        await pool.query("DELETE FROM notifications WHERE entity_type='leads' AND entity_id IN (?)", [leads.map(r => r.id)]);
        await pool.query('DELETE FROM business_journeys WHERE id IN (?)', [leads.map(r => r.journey_id)]);
      }
      const [rows] = await pool.query('SELECT id FROM users WHERE email LIKE ? ORDER BY id DESC', [prefix + '%@example.invalid']);
      for (const row of rows) await pool.query('DELETE FROM users WHERE id = ?', [row.id]);
      console.log('{}');
      return;
    }
    const hash = await require('bcryptjs').hash(${JSON.stringify(password)}, 10);
    for (const [kind, role, dept, title] of [
      ['super', 'SUPER_ADMIN', '', ''],
      ['tgd', 'ADMIN', 'Ban Tổng Giám đốc', 'Tổng Giám đốc'],
      ['planning', 'MKT', 'Phòng Công nghệ và Quy hoạch', 'Chuyên viên'],
      ['director', 'SALES', department, 'Giám đốc Trung tâm Kinh doanh'],
      ['area', 'SALES', department, 'Giám đốc Khu vực'],
      ['staff', 'SALES', department, 'Chuyên viên'],
      ['denied', 'ADMIN', 'Back office', 'Chuyên viên']
    ]) {
      const email = prefix + '-' + kind + '@example.invalid';
      const parent = ['area', 'staff'].includes(kind) ? users.find(u => u.kind === 'director').id : null;
      const [result] = await pool.query(
        "INSERT INTO users (full_name,email,password,role,status,parent_id,custom_data) VALUES (?,?,?,?,'ACTIVE',?,?)",
        [prefix + '-' + kind, email, hash, role, parent, JSON.stringify({ department: dept, chuc_vu: title })]);
      users.push({ kind, email, id: result.insertId });
    }
    const records = {};
    for (const [kind, status, assignee] of [
      ['allocation', 'WAITING_ALLOCATION', 'director'], ['first', 'WAITING_FIRST_CONTACT', 'area'],
      ['consulting', 'CONSULTING', 'area'], ['success', 'SUCCESS', 'area'], ['failed', 'FAILED', 'area'],
      ['orphan', 'WAITING_ALLOCATION', null], ['staff', 'CONSULTING', 'staff']
    ]) {
      const [journey] = await pool.query("INSERT INTO business_journeys (journey_code,current_stage,status,started_at) VALUES (?,'NEW','ACTIVE',NOW())", [require('crypto').randomUUID()]);
      const calendar = await require('./src/services/businessCalendarService').getCalendar();
      const [result] = await pool.query(
        'INSERT INTO leads (journey_id,full_name,phone,created_by,customer_classification,assigned_department,assigned_user_id,consultation_status,first_contact_deadline_at,consultation_calendar_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [journey.insertId, prefix + '-' + kind, '0900000000', users[0].id, 'TIEM_NANG', department,
          assignee ? users.find(u => u.kind === assignee).id : null, status,
          status === 'WAITING_FIRST_CONTACT' ? require('./src/services/businessCalendarService').addWorkingMinutes(new Date(), 240, calendar) : null,
          status === 'WAITING_FIRST_CONTACT' ? calendar.id : null]);
      records[kind] = result.insertId;
    }
    console.log(JSON.stringify({users, records}));
  } finally { await pool.end(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
`
  }));

async function main() {
  let browser;
  try {
    const fixtures = runFixture('create');
    browser = await chromium.launch({ headless: true });
    const policies = {
      super: [6, 'all'], tgd: [6, 'all'], planning: [6, 'all'],
      director: [3, 'allocation'], area: [4, 'first-contact'], staff: [1, 'all']
    };
    for (const [kind, [count, defaultTab]] of Object.entries(policies)) {
      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', err => errors.push(err.message));
      const user = fixtures.users.find(item => item.kind === kind);
      let login = await context.request.post(`${BASE}/api/auth/login`, { data: { email: user.email, password } });
      if (login.status() === 429) {
        await new Promise(resolve => setTimeout(resolve, (Number(login.headers()['retry-after']) || 60) * 1000 + 500));
        login = await context.request.post(`${BASE}/api/auth/login`, { data: { email: user.email, password } });
      }
      const body = await login.json();
      assert.equal(body.success, true, body.message);
      await page.goto(`${BASE}/login`);
      await page.evaluate(token => localStorage.setItem('token', token), body.data.token);
      await page.goto(`${BASE}/admin/leads`);
      await page.waitForLoadState('networkidle');
      assert.equal(new URL(page.url()).searchParams.get('tab'), defaultTab, `${kind} default tab`);
      const tablist = page.getByRole('tablist', { name: 'Nhóm khách hàng' });
      assert.equal(await tablist.getByRole('tab').count(), count, `${kind} tab count`);
      const summary = await context.request.get(`${BASE}/api/admin/leads/task-counts`, {
        headers: { Authorization: `Bearer ${body.data.token}` }
      });
      const { data } = await summary.json();
      const taskLabels = { allocation: 'Cần phân chia', 'first-contact': 'Cần tư vấn lần đầu', consulting: 'Đang tư vấn' };
      for (const [tab, label] of Object.entries(taskLabels)) {
        if (!data.tabs.includes(tab)) continue;
        const button = tablist.getByRole('tab', { name: new RegExp(`^${label}`) });
        if (data.counts[tab] > 0) {
          assert.equal(await button.locator('span').textContent(), String(data.counts[tab]));
        } else assert.equal(await button.locator('span').count(), 0);
      }
      const nav = page.getByRole('link').filter({ hasText: 'Quản lý khách hàng' });
      if (data.total > 0) {
        await nav.locator('.sidebar-task-badge').waitFor();
        assert.equal(await nav.locator('.sidebar-task-badge').textContent(), data.total > 999 ? '999+' : String(data.total));
      } else assert.equal(await nav.locator('.sidebar-task-badge').count(), 0);
      await tablist.getByRole('tab', { name: 'Tất cả', exact: true }).click();
      await page.getByPlaceholder('Tìm kiếm theo tên, SĐT, mã Lead...').fill(prefix);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(600);
      const rows = page.getByRole('row').filter({ hasText: prefix });
      assert.equal(await rows.count(), kind === 'area' ? 4 : kind === 'staff' ? 1 : 7);
      const exported = await context.request.get(`${BASE}/api/admin/excel/export/leads?tab=all&search=${encodeURIComponent(prefix)}`, {
        headers: { Authorization: `Bearer ${body.data.token}` }
      });
      assert.equal(exported.status(), 200);
      const workbook = XLSX.read(await exported.body(), { type: 'buffer' });
      const exportRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
      assert.equal(exportRows.filter(row => row.some(value => String(value).startsWith(prefix))).length,
        kind === 'area' ? 4 : kind === 'staff' ? 1 : 7);
      if (['super', 'director', 'area'].includes(kind)) {
        const exportTab = kind === 'super' ? 'allocation' : kind === 'director' ? 'allocated' : 'consulting';
        const tabExport = await context.request.get(`${BASE}/api/admin/excel/export/leads?tab=${exportTab}&search=${encodeURIComponent(prefix)}`, {
          headers: { Authorization: `Bearer ${body.data.token}` }
        });
        assert.equal(tabExport.status(), 200);
        const book = XLSX.read(await tabExport.body(), { type: 'buffer' });
        const sheetRows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1 });
        assert.equal(sheetRows.filter(row => row.some(value => String(value).startsWith(prefix))).length,
          kind === 'director' ? 4 : 1, `${kind} tab-specific Excel`);
      }
      if (['director', 'area', 'staff'].includes(kind)) {
        const forbiddenTab = kind === 'director' ? 'completed' : 'allocation';
        const forbiddenExport = await context.request.get(`${BASE}/api/admin/excel/export/leads?tab=${forbiddenTab}`, {
          headers: { Authorization: `Bearer ${body.data.token}` }
        });
        assert.equal(forbiddenExport.status(), 403);
      }
      if (['tgd', 'planning', 'staff'].includes(kind)) {
        assert.equal(await page.getByRole('button', { name: 'Sửa', exact: true }).count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Phân chia', exact: true }).count(), 0);
        const denied = await context.request.put(`${BASE}/api/admin/leads/${kind === 'staff' ? fixtures.records.staff : fixtures.records.consulting}`, {
          headers: { Authorization: `Bearer ${body.data.token}` }, data: { tvbh_note: 'Must be denied' }
        });
        assert.equal(denied.status(), 403);
      }
      await rows.first().getByRole('button', { name: 'Xem', exact: true }).click();
      await page.getByRole('heading', { name: /^Lead #/ }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('tab'), 'all');
      await page.locator('.modal-overlay').getByRole('button', { name: 'Đóng', exact: true }).last().click();
      assert.equal(new URL(page.url()).searchParams.get('tab'), 'all');
      assert.equal(await page.getByPlaceholder('Tìm kiếm theo tên, SĐT, mã Lead...').inputValue(), prefix);
      if (kind === 'area') {
        await tablist.getByRole('tab', { name: /^Cần tư vấn lần đầu/ }).click();
        await page.getByRole('row').filter({ hasText: `${prefix}-first` })
          .getByRole('button', { name: 'Sửa', exact: true }).click();
        const section = page.getByRole('group', { name: 'Tư vấn bán hàng (TVBH)', exact: true });
        await section.getByRole('button', { name: '+ Thêm dòng', exact: true }).click();
        const history = section.getByRole('row').last();
        await history.getByRole('combobox').selectOption({ label: 'Đang tư vấn' });
        await history.getByRole('textbox').nth(1).fill('Browser fixture: first consultation');
        await page.getByRole('button', { name: 'Lưu', exact: true }).click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(700);
        assert.equal(new URL(page.url()).searchParams.get('tab'), 'first-contact');
        assert.equal(await tablist.getByRole('tab', { name: /^Cần tư vấn lần đầu/ }).locator('span').count(), 0);
        assert.equal(await tablist.getByRole('tab', { name: /^Đang tư vấn/ }).locator('span').textContent(), '2');
        await page.locator('.modal-overlay').getByRole('button', { name: 'Đóng', exact: true }).last().click();
        const consultingResponse = page.waitForResponse(response => response.url().includes('/api/admin/leads?')
          && new URL(response.url()).searchParams.get('tab') === 'consulting');
        await tablist.getByRole('tab', { name: /^Đang tư vấn/ }).click();
        const loaded = await consultingResponse;
        const result = await loaded.json();
        assert.equal(loaded.status(), 200, result.message);
        assert.equal(result.data.length, 2, JSON.stringify(result.pagination));
        await page.getByRole('row').filter({ hasText: `${prefix}-first` }).waitFor();
        assert.equal(await page.getByRole('row').filter({ hasText: prefix }).count(), 2);
      }
      assert.deepEqual(errors, [], `${kind} runtime errors`);
      if (kind === 'super') {
        await page.setViewportSize({ width: 390, height: 844 });
        const dimensions = await tablist.evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth }));
        assert.ok(dimensions.content > dimensions.width, 'mobile tabs scroll horizontally');
      }
      console.log(`PASS ${kind}: tabs, default, scoped rows, badge, popup and permissions`);
      await context.close();
      await new Promise(resolve => setTimeout(resolve, 12000));
    }
  } finally {
    if (browser) await browser.close();
    runFixture('cleanup');
  }
}

main().catch(err => { console.error(err); process.exitCode = 1; });
