const { test, expect } = require('@playwright/test');

for (const scenario of ['success', 'save-error', 'complete-error', 'invalid', 'mobile']) {
  test(`single-click request update and completion: ${scenario}`, async ({ page }) => {
    if (scenario === 'mobile') await page.setViewportSize({ width: 390, height: 844 });
    const calls = [], errors = [];
    let completionAttempts = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('token', 'request-update-fixture'));
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      let data = [];
      if (path.endsWith('/auth/me')) data = { user: { id: 1, role: 'SALES', full_name: 'Fixture', custom_data: {} } };
      else if (path.endsWith('/update-context')) data = {
        canUpdate: true, canComplete: true,
        request: { id: 11, proposal_id: 101, request_type: 'UPDATE_INFO', ma_de_xuat: 'DX101' },
        proposal: { id: 101, owner_name: 'Tên cũ' }
      };
      else if (path.endsWith('/forms/by-entity-purpose')) data = { id: 14 };
      else if (path.endsWith('/dynamic/station_proposals/form/14')) data = {
        form: { id: 14, layout_config: { rows: [{ id: 'r1', columns: '1:1' }] } },
        fields: [{ id: 1, key: 'owner_name', label: 'Tên chủ trạm', type: 'text',
          required: true, visible: true, config: { rowId: 'r1', colIndex: 0 } }]
      };
      else if (path.endsWith('/11/proposal') || path.endsWith('/11/complete')) {
        const complete = path.endsWith('/complete');
        calls.push({ kind: complete ? 'complete' : 'save', body: request.postDataJSON() });
        if (complete) completionAttempts++;
        if ((!complete && scenario === 'save-error') || (complete && scenario === 'complete-error' && completionAttempts === 1)) {
          return route.fulfill({ status: 400, contentType: 'application/json',
            body: JSON.stringify({ success: false, message: complete ? 'Xác nhận thất bại' : 'Lưu thất bại' }) });
        }
        data = { id: 101 };
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    });
    await page.goto('/admin/proposals/yeu-cau-cap-nhat/11');
    const form = page.locator('#proposal-request-update-form');
    const input = form.locator('input').first();
    await expect(input).toHaveValue('Tên cũ');
    await expect(page.getByRole('button', { name: 'Lưu thông tin', exact: true })).toHaveCount(0);
    await input.fill(scenario === 'invalid' ? '' : 'Tên đã cập nhật');
    const confirm = page.getByRole('button', { name: 'Xác nhận đã cập nhật', exact: true });
    await confirm.click();
    if (scenario === 'invalid') {
      await expect(form).toContainText('bắt buộc');
      expect(calls).toEqual([]);
    } else if (scenario === 'save-error') {
      await expect(page.getByText('Lưu thất bại', { exact: true }).first()).toBeVisible();
      expect(calls.map(c => c.kind)).toEqual(['save']);
      await expect(page).toHaveURL(/yeu-cau-cap-nhat\/11/);
    } else {
      if (scenario === 'complete-error') {
        await expect(page.getByText(/Đã lưu thông tin nhưng chưa xác nhận hoàn thành/).first()).toBeVisible();
        await expect(input).toHaveValue('Tên đã cập nhật');
        await confirm.click();
      }
      await expect(page).toHaveURL(/\/admin\/proposals\?tab=requests$/);
      expect(calls.map(c => c.kind)).toEqual(scenario === 'complete-error'
        ? ['save', 'complete', 'save', 'complete'] : ['save', 'complete']);
      expect(calls[0].body.owner_name).toBe('Tên đã cập nhật');
      expect(calls[1].body.resolution_note).toBe('Đã cập nhật thông tin theo yêu cầu.');
    }
    expect(errors).toEqual([]);
  });
}
