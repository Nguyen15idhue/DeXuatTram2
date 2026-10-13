const { test, expect } = require('@playwright/test');

const API = process.env.E2E_API_URL || 'http://localhost:3000';
const FE = process.env.E2E_BASE_URL || 'http://localhost:5173';

// FE-03: RBAC Leads + form chung (section/textarea).
// Yêu cầu tài khoản local có mật khẩu Test1234!: mkt.test@station.com (MKT),
// taild.egreen@tmt-vietnam.com (SALES GĐKV). Chạy xong KHÔNG để lại dữ liệu test.
async function login(request, email, password = 'Test1234!') {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { email, password }
  });
  expect(res.ok(), `login ${email}`).toBeTruthy();
  return (await res.json()).data.token;
}

async function setToken(page, token) {
  await page.goto(`${FE}/login`);
  await page.evaluate((t) => {
    localStorage.setItem('token', t);
    localStorage.removeItem('remember_until');
  }, token);
}

async function setTextareaByLabel(page, labelText, text) {
  await page.evaluate(({ labelText, text }) => {
    const lb = [...document.querySelectorAll('label')].find(
      (l) => l.textContent.trim() === labelText
    );
    if (!lb) throw new Error(`không thấy label ${labelText}`);
    const ta = lb.parentElement.querySelector('textarea');
    if (!ta) throw new Error(`label ${labelText} không kèm textarea`);
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    ).set;
    setter.call(ta, text);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, { labelText, text });
}

test.describe('FE-03 lead RBAC (SALES cấm tạo/import/xóa, MKT cấm phân chia)', () => {
  test('BE: SALES bị 403 tạo/xóa/import/assign, vẫn GET + sửa TVBH', async ({ request }) => {
    const token = await login(request, 'taild.egreen@tmt-vietnam.com');
    const auth = { Authorization: `Bearer ${token}` };

    const createRes = await request.post(`${API}/api/admin/leads`, {
      headers: auth,
      data: { full_name: 'SALES tao trom', phone: '0985214753', province: 'Thành phố Hà Nội' }
    });
    expect(createRes.status(), 'SALES POST lead -> 403').toBe(403);

    const delRes = await request.delete(`${API}/api/admin/leads/2`, { headers: auth });
    expect(delRes.status(), 'SALES DELETE lead -> 403').toBe(403);

    const impRes = await request.post(`${API}/api/admin/excel/import/confirm`, {
      headers: auth, data: { entity: 'leads' }
    });
    expect(impRes.status(), 'SALES import leads -> 403').toBe(403);

    const asgRes = await request.post(`${API}/api/admin/leads/2/assign`, {
      headers: auth, data: { assignee_user_id: 241 }
    });
    expect(asgRes.status(), 'SALES GĐKV assign -> 403').toBe(403);

    const listRes = await request.get(`${API}/api/admin/leads`, { headers: auth });
    expect(listRes.ok(), 'SALES GET leads -> 200').toBeTruthy();
  });

  test('BE: MKT tạo + lưu ma TVBH OK, đổi assigned/assign -> 403', async ({ request }) => {
    const token = await login(request, 'mkt.test@station.com');
    const auth = { Authorization: `Bearer ${token}` };
    const stamp = Date.now();
    const phone = '09' + String(stamp).slice(-8);

    const createRes = await request.post(`${API}/api/admin/leads`, {
      headers: auth,
      data: { full_name: `E2E MKT ${stamp}`, phone, province: 'Thành phố Hà Nội' }
    });
    expect(createRes.ok(), 'MKT POST lead -> 201').toBeTruthy();
    const lead = (await createRes.json()).data;

    const phantom = await request.put(`${API}/api/admin/leads/${lead.id}`, {
      headers: auth,
      data: { note: 'sua marketing', tvbh_history: [], tvbh_note: '', sales_outcome: '' }
    });
    expect(phantom.ok(), 'MKT PUT kèm TVBH rỗng -> 200 (không 403 ma)').toBeTruthy();

    const steal = await request.put(`${API}/api/admin/leads/${lead.id}`, {
      headers: auth, data: { assigned_user_id: 241 }
    });
    expect(steal.status(), 'MKT đổi assigned_user_id -> 403').toBe(403);

    const asg = await request.post(`${API}/api/admin/leads/${lead.id}/assign`, {
      headers: auth, data: { assignee_user_id: 241 }
    });
    expect(asg.status(), 'MKT assign -> 403').toBe(403);

    const del = await request.delete(`${API}/api/admin/leads/${lead.id}`, { headers: auth });
    expect(del.ok(), 'MKT xóa lead mình tạo (dọn test)').toBeTruthy();
  });

  test('FE: SALES không nút tạo/nhập/xóa, sửa TVBH lưu được', async ({ page, request }) => {
    const token = await login(request, 'taild.egreen@tmt-vietnam.com');
    const adminToken = await login(request, 'admin@station.com', '123456');
    const adminAuth = { Authorization: `Bearer ${adminToken}` };
    const stamp = Date.now();
    const fixture = await request.post(`${API}/api/admin/leads`, {
      headers: adminAuth,
      data: {
        full_name: `E2E SALES UI ${stamp}`,
        phone: '09' + String(stamp).slice(-8),
        province: 'Thành phố Hà Nội',
        customer_classification: 'Tiềm năng'
      }
    });
    expect(fixture.ok(), 'admin tạo fixture lead').toBeTruthy();
    const fixtureId = (await fixture.json()).data.id;
    const asg = await request.post(`${API}/api/admin/leads/${fixtureId}/assign`, {
      headers: adminAuth, data: { assignee_user_id: 241 }
    });
    expect(asg.ok(), 'admin gán fixture cho SALES 241').toBeTruthy();

    try {
      await setToken(page, token);
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));

      await page.goto(`${FE}/admin/leads`);
      await expect(page.getByRole('heading', { name: 'Quản lý Leads' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Thêm Lead' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Nhập Excel' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Xóa', exact: true })).toHaveCount(0);

      await page.goto(`${FE}/admin/leads/edit=${fixtureId}`);
      await expect(page.locator('fieldset.form-section-block-first').first()).toBeVisible();
      const padTop = await page.locator('fieldset.form-section-block-first').first()
        .evaluate((el) => getComputedStyle(el).paddingTop);
      expect(padTop, 'section đầu padding-top 4px').toBe('4px');

      const tvbhBox = page.locator('[data-lead-section="tvbh"] textarea').first();
      await expect(tvbhBox).toBeVisible();
      await expect(tvbhBox).toBeEditable();
      await expect(tvbhBox).toHaveAttribute('rows', '1');

      await tvbhBox.evaluate((el, t) => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        ).set;
        setter.call(el, `SALES E2E TVBH ${t}`);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, stamp);
      await page.getByRole('button', { name: 'Lưu' }).click();
      await expect(page.getByText('Cập nhật Lead thành công')).toBeVisible({ timeout: 15000 });

      const salesAuth = { Authorization: `Bearer ${token}` };
      const after = await (await request.get(`${API}/api/admin/leads/${fixtureId}`, { headers: salesAuth })).json();
      expect(after.data.tvbh_note, 'tvbh_note đã lưu').toBe(`SALES E2E TVBH ${stamp}`);
      expect(errors, `pageerror: ${errors.join('; ')}`).toEqual([]);
    } finally {
      await request.delete(`${API}/api/admin/leads/${fixtureId}`, { headers: adminAuth });
    }
  });

  test('FE: MKT đủ nút tạo/nhập/xóa nhưng không nút phân chia, sửa + lưu được, textarea gọn', async ({ page, request }) => {
    const token = await login(request, 'mkt.test@station.com');
    const auth = { Authorization: `Bearer ${token}` };
    const stamp = Date.now();
    const created = await request.post(`${API}/api/admin/leads`, {
      headers: auth,
      data: { full_name: `E2E MKT UI ${stamp}`, phone: '09' + String(stamp).slice(-8), province: 'Thành phố Hà Nội' }
    });
    expect(created.ok(), 'tạo lead test').toBeTruthy();
    const leadId = (await created.json()).data.id;

    try {
      await setToken(page, token);
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));

      await page.goto(`${FE}/admin/leads`);
      await expect(page.getByRole('heading', { name: 'Quản lý Leads' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Thêm Lead' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Nhập Excel' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Xóa', exact: true }).first()).toBeVisible();

      await page.goto(`${FE}/admin/leads/view=${leadId}`);
      await expect(page.getByRole('button', { name: 'Phân chia Lead' })).toHaveCount(0);

      await page.goto(`${FE}/admin/leads/edit=${leadId}`);
      const noteBox = page.locator('fieldset[data-lead-section="marketing"] textarea, fieldset:not([data-lead-section]) textarea').first();
      await expect(noteBox).toBeVisible();
      const rows = await noteBox.getAttribute('rows');
      expect(rows, 'textarea rows=1').toBe('1');
      const height = (await noteBox.boundingBox()).height;
      expect(height, `textarea gọn (đo được ${height}px)`).toBeLessThan(70);

      await setTextareaByLabel(page, 'Ghi chú', `MKT UI note ${stamp}`);
      await page.getByRole('button', { name: 'Lưu' }).click();
      await expect(page.getByText('Cập nhật Lead thành công')).toBeVisible({ timeout: 15000 });

      const after = await (await request.get(`${API}/api/admin/leads/${leadId}`, { headers: auth })).json();
      expect(after.data.note, 'note đã lưu').toBe(`MKT UI note ${stamp}`);
      expect(errors, `pageerror: ${errors.join('; ')}`).toEqual([]);
    } finally {
      await request.delete(`${API}/api/admin/leads/${leadId}`, { headers: auth });
    }
  });
});
