const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

test('super admin previews, confirms and retries historical import', async ({ page }) => {
  const errors = [];
  let previews = 0;
  let confirmations = 0;
  const bodies = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('token', 'preview-fixture'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/historical-on-import/template')) {
      return route.fulfill({ contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: 'fixture' });
    }
    let data = [];
    if (url.pathname.endsWith('/auth/me')) data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'UI Test' } };
    else if (url.pathname.endsWith('/historical-on-import/confirm')) {
      confirmations++;
      bodies.push(route.request().postDataBuffer().toString());
      if (confirmations === 1) return route.fulfill({ status: 409, json: { success: false, message: 'Dữ liệu đang được cập nhật' } });
      data = { batch_key: 'batch-1', rows: [{ row: 2, action: 'create', proposal_id: 42, charging_station_id: 3 }] };
    }
    else if (url.pathname.endsWith('/historical-on-import/preview')) {
      previews++;
      data = {
      import_available: false,
      rows: [{ row: 2, legacy_code: 'OLD-1', cms_code: 'CMS-1', action: 'choose', proposal_id: null,
        candidates: [{ id: 10 }, { id: 11 }], owner: null, owner_candidates: [],
        proposal_status: 'Đang triển khai', on_status: 'Lắp trụ',
        poles: [{ model: 'NQ', name: 'AC 22kW', committed: 10, shipped: 4, received: 4, installed: 2, accepted: 0, on: 1 }],
        errors: ['Cần chọn ID', 'NQ AC 22kW: không thể phân bổ số lượng trong file mà vẫn giữ nguyên chứng từ thực; cần đối soát'],
        warnings: ['Có trụ đã ON nhưng chưa nhập ngày ON đầu tiên'] }]
      };
      if (previews > 1) {
        data.import_available = true;
        data.proof = 'signed-preview';
        data.rows[0].action = 'create';
        data.rows[0].errors = [];
      }
    }
    else if (url.pathname.endsWith('/filter-options')) data = { owners: [], managers: [], workScopes: [] };
    else if (url.pathname.includes('/countdown') || url.pathname.endsWith('/assistant/status')) data = {};
    return route.fulfill({ json: { success: true, data, pagination: { page: 1, total: 0, totalPages: 1, limit: 20 } } });
  });
  await page.goto('/admin/proposals');
  await page.getByTitle('Thao tác', { exact: true }).click();
  await page.getByRole('button', { name: 'Import dữ liệu trạm cũ' }).click();
  await expect(page.getByText('Kiểm tra kỹ dữ liệu trước khi xác nhận.', { exact: false })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({ name: 'test.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('fixture') });
  await page.getByRole('button', { name: 'Kiểm tra sơ bộ' }).click();
  await expect(page.getByText('OLD-1')).toBeVisible();
  await expect(page.getByText('ID phù hợp: 10, 11')).toBeVisible();
  await expect(page.getByText('Cần chọn ID', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('NQ AC 22kW: không thể phân bổ số lượng trong file mà vẫn giữ nguyên chứng từ thực; cần đối soát')).toBeVisible();
  await expect(page.getByText('Đang triển khai / Lắp trụ')).toBeVisible();
  await expect(page.getByText('NQ AC 22kW: chốt 10, giao 4, nhận 4, lắp 2, nghiệm thu 0, ON 1')).toBeVisible();
  await expect(page.getByText('Có trụ đã ON nhưng chưa nhập ngày ON đầu tiên')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xác nhận import' })).toBeDisabled();
  await page.getByRole('button', { name: 'Kiểm tra sơ bộ' }).click();
  await page.getByRole('button', { name: 'Xác nhận import' }).click();
  await page.locator('.confirm-dialog').getByRole('button', { name: 'Xác nhận import' }).click();
  await expect(page.getByRole('alert')).toContainText('Dữ liệu đang được cập nhật');
  await page.getByRole('button', { name: 'Xác nhận import' }).click();
  await page.locator('.confirm-dialog').getByRole('button', { name: 'Xác nhận import' }).click();
  await expect(page.getByRole('status')).toContainText('Đã import 1 dòng: 1 tạo mới, 0 cập nhật.');
  await expect(page.getByRole('button', { name: 'Xác nhận import' })).toBeDisabled();
  expect(confirmations).toBe(2);
  for (const body of bodies) {
    expect(body).toContain('signed-preview');
    expect(body).toContain('fixture');
  }
  expect(errors).toEqual([]);
});
