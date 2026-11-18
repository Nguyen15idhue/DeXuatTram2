const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

for (const [role, department, allowed] of [
  ['SUPER_ADMIN', 'Back Office', true],
  ['SALES', 'Back Office', true],
  ['ADMIN', 'Back Office', true],
  ['SALES', 'Phòng Setup và Vận hành', true],
  ['SALES', 'Người đề xuất', true],
  ['SALES', 'Quản lý nhánh', true],
  ['CTV', 'Người phụ trách', true],
  ['NPP', 'Quản lý nhánh', true],
  ['ADMIN', 'Phòng khác', false]
]) {
  test(`${role} ${department} infrastructure cells, modal and transition permissions`, async ({ page }) => {
    const updates = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const station = { id: 501, ma_tram: 'ON-501', proposal_id: 77, status: 'DELIVERING',
      infra_power_status: 'NOT', infra_site_status: 'DONE', ngay_du_kien_on: '2026-12-01',
      permissions: { infrastructure: allowed, infrastructure_task: ['CTV', 'NPP'].includes(role) } };
    await page.route('**/api/**', async route => {
      const { pathname } = new URL(route.request().url());
      let data = {};
      if (pathname.endsWith('/auth/me')) data = { user: { id: 1, role, custom_data: { department } } };
      else if (pathname.endsWith('/charging-stations')) data = [station];
      else if (pathname.endsWith('/activity')) data = [{
        id: 1, action: 'infrastructure_status_changed', actor_name: 'Quản lý hạ tầng',
        created_at: '2026-11-16T08:00:00+07:00', reject_reason: 'Lịch sử toàn bước',
        changed_fields: { infra_power_status: { old: 'NOT', new: 'DOING' } }
      }];
      else if (/\/infrastructure\/(power|site)\/status$/.test(pathname)) {
        updates.push({ pathname, body: route.request().postDataJSON() });
        const type = pathname.includes('/power/') ? 'power' : 'site';
        station[`infra_${type}_status`] = updates.at(-1).body.status;
      }

      await route.fulfill({ contentType: 'application/json',
        body: JSON.stringify({ success: true, data, pagination: { page: 1, total: 1, totalPages: 1 } }) });
    });
    await page.addInitScript(() => localStorage.setItem('token', 'infra-test'));
    await page.goto('/admin/on-tram/xay-dung-ha-tang?tab=all');
    await expect(page.getByText('ON-501', { exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Hành động', exact: true })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Ngày ON dự kiến', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Tài chính', exact: true })).toHaveCount(0);
    if (!allowed) {
      await expect(page.getByRole('button', { name: /^Hạ tầng điện:/ })).toHaveCount(0);
      expect(updates).toEqual([]);
      return;
    }
    for (const [type, title, label, old, target] of [
      ['power', 'Hạ tầng điện', 'Trạng thái điện', 'NOT', role === 'SUPER_ADMIN' ? 'DONE' : 'DOING'],
      ['site', 'Hạ tầng mặt bằng', 'Trạng thái mặt bằng', 'DONE', 'NOT']
    ]) {
      await page.getByRole('button', { name: new RegExp(`^${title}:`) }).click();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Lịch sử thay đổi trạng thái' })).toBeVisible();
      await expect(page.getByRole('cell', { name: 'Quản lý hạ tầng', exact: true })).toBeVisible();
      await expect(page.getByRole('cell', { name: 'Lịch sử toàn bước', exact: true })).toBeVisible();
      const select = page.getByLabel(label, { exact: true });
      for (const value of ['NOT', 'DOING', 'DONE']) {
        await expect(select.locator(`option[value="${value}"]`)).toHaveJSProperty('disabled', false);
      }
      await select.selectOption(target);
      const today = await page.evaluate(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }));
      await expect(page.getByLabel('Ngày', { exact: true })).toHaveValue(today);
      await page.getByLabel('Ngày', { exact: true }).fill('');
      await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
      await expect(page.getByText('Vui lòng nhập ngày thực hiện')).toBeVisible();
      await page.getByLabel('Ngày', { exact: true }).fill('2026-11-10');
      await page.getByLabel('Ghi chú', { exact: true }).fill(`Update ${type}`);
      await page.getByRole('button', { name: 'Hủy', exact: true }).click();
      expect(updates.length).toBe(type === 'power' ? 0 : 1);
      await page.getByRole('button', { name: new RegExp(`^${title}:`) }).click();
      await select.selectOption(target);
      await page.getByLabel('Ngày', { exact: true }).fill('2026-11-10');
      await page.getByLabel('Ghi chú', { exact: true }).fill(`Update ${type}`);
      await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
      await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
      expect(updates.at(-1)).toEqual({
        pathname: `/api/admin/charging-stations/501/infrastructure/${type}/status`,
        body: { status: target, expected_status: old, date: '2026-11-10', note: `Update ${type}` }
      });
    }
    expect(errors).toEqual([]);
  });
}

for (const department of ['Người đề xuất', 'Quản lý nhánh', 'Phòng Setup và Vận hành']) {
  test(`${department} sees pending infrastructure tasks and badge until both items are DONE`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const station = { id: 501, ma_tram: 'ON-TASK-501', proposal_id: 77, status: 'DELIVERING', contract_status: 'DONE',
      infra_power_status: 'NOT', infra_site_status: 'NOT',
      permissions: { infrastructure: true, infrastructure_task: true } };
    const pending = () => station.contract_status === 'DONE'
      && (station.infra_power_status !== 'DONE' || station.infra_site_status !== 'DONE');
    await page.addInitScript(() => localStorage.setItem('token', 'infra-task-test'));
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      let data = [];
      if (url.pathname.endsWith('/auth/me')) data = { user: { id: 1, role: 'SALES', custom_data: { department } } };
      else if (url.pathname.endsWith('/charging-stations/task-counts')) {
        data = { total: pending() ? 1 : 0, counts: { infrastructure: pending() ? 1 : 0 } };
      } else if (url.pathname.endsWith('/charging-stations')) {
        expect(url.searchParams.get('stage')).toBe('xay-dung-ha-tang');
        expect(url.searchParams.get('tab')).toBe('need');
        data = pending() ? [station] : [];
      } else if (/\/infrastructure\/(power|site)\/status$/.test(url.pathname)) {
        const type = url.pathname.includes('/power/') ? 'power' : 'site';
        const body = route.request().postDataJSON();
        expect(body.expected_status).toBe('NOT');
        expect(body.status).toBe('DONE');
        station[`infra_${type}_status`] = body.status;
      }

      await route.fulfill({ json: { success: true, data,
        pagination: { page: 1, total: pending() ? 1 : 0, totalPages: 1 } } });
    });
    await page.goto('/admin/on-tram/xay-dung-ha-tang');
    const tab = page.getByRole('tab', { name: /Trạm sạc cần thực hiện/ });
    await expect(tab.locator('.badge')).toHaveText('1');
    await expect(page.getByRole('link', { name: 'ON-TASK-501', exact: true })).toBeVisible();
    for (const [title, label] of [['Hạ tầng điện', 'Trạng thái điện'], ['Hạ tầng mặt bằng', 'Trạng thái mặt bằng']]) {
      await page.getByRole('button', { name: new RegExp(`^${title}:`) }).click();
      await page.getByLabel(label, { exact: true }).selectOption('DONE');
      await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
      await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
      if (pending()) {
        await expect(tab.locator('.badge')).toHaveText('1');
        await expect(page.getByRole('link', { name: 'ON-TASK-501', exact: true })).toBeVisible();
      }
    }
    await expect(tab.locator('.badge')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'ON-TASK-501', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('unsigned contracts have no infrastructure task while all/completed tabs and editing remain available', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const station = {
    id: 501, ma_tram: 'ON-CONTRACT-GATE', proposal_id: 77, status: 'ONBOARDING',
    contract_status: 'NOT', infra_power_status: 'NOT', infra_site_status: 'NOT',
    permissions: { infrastructure: true, infrastructure_task: true }
  };
  const completed = () => station.infra_power_status === 'DONE' && station.infra_site_status === 'DONE';
  const pending = () => station.contract_status === 'DONE' && !completed();
  await page.addInitScript(() => localStorage.setItem('token', 'infra-contract-task-test'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    let data = [];
    if (url.pathname.endsWith('/auth/me')) data = {
      user: { id: 1, role: 'SALES', custom_data: { department: 'Phòng Setup và Vận hành' } }
    };
    else if (url.pathname.endsWith('/charging-stations/task-counts')) {
      data = { total: pending() ? 1 : 0, counts: { infrastructure: pending() ? 1 : 0 } };
    } else if (url.pathname.endsWith('/charging-stations')) {
      const tab = url.searchParams.get('tab');
      data = (tab === 'all' || (tab === 'need' ? pending() : completed())) ? [station] : [];
    }
    await route.fulfill({ json: { success: true, data,
      pagination: { page: 1, total: Array.isArray(data) ? data.length : 0, totalPages: 1 } } });
  });
  const need = page.getByRole('tab', { name: /Trạm sạc cần thực hiện/ });
  const record = page.getByRole('link', { name: 'ON-CONTRACT-GATE', exact: true });
  for (const status of ['NOT', 'DOING', 'DONE', 'NOT', 'DONE']) {
    station.contract_status = status;
    await page.goto('/admin/on-tram/xay-dung-ha-tang');
    await expect(need).toHaveAttribute('aria-selected', 'true');
    if (pending()) {
      await expect(need.locator('.badge')).toHaveText('1');
      await expect(record).toBeVisible();
    } else {
      await expect(need.locator('.badge')).toHaveCount(0);
      await expect(record).toHaveCount(0);
    }
    await page.getByRole('tab', { name: 'Tất cả trạm sạc', exact: true }).click();
    await expect(record).toBeVisible();
    await expect(page.getByRole('button', { name: /^Hạ tầng điện:/ })).toBeVisible();
  }
  station.contract_status = 'NOT';
  station.infra_power_status = 'DONE';
  station.infra_site_status = 'DONE';
  await page.reload();
  await expect(need.locator('.badge')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Trạm sạc đã hoàn thành', exact: true }).click();
  await expect(record).toBeVisible();
  expect(errors).toEqual([]);
});
