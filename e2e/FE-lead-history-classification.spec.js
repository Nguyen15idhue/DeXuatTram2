const { test, expect } = require('@playwright/test');
const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:5174';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`lead history classification across tabs (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem('token', 'lead-history-fixture'));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const fields = [
      { key: 'lead_code', field_key: 'lead_code', label: 'Mã Lead', type: 'text', visible: true },
      { key: 'customer_classification', field_key: 'customer_classification', label: 'CSKH phân loại', type: 'text', visible: true },
      { key: 'note', field_key: 'note', label: 'Ghi chú', type: 'text', visible: true },
      { id: 42, key: 'history_priority', type: 'select', data_list_id: 12, data_list_column: 'code', data_list_label_column: 'name' },
      { key: 'tvbh_history', type: 'table', source_config: JSON.stringify({ columns: [
        viewport.width < 768
          ? { key: 'GDKV_phan_loai_KH', field_id: 42, options_source: 'inherit' }
          : { key: 'GDKV_phan_loai_KH', options: [{ value: 'A', label: 'Nhóm A' }, { value: 'B', label: 'Nhóm B' }] }
      ] }) }
    ];
    const row = (id, history, asString = false) => ({
      id, lead_code: `LD-${id}`, customer_classification: 'Khác',
      custom_data: asString ? JSON.stringify({ tvbh_history: JSON.stringify(history) }) : { tvbh_history: history }
    });
    const leads = [
      row(1, [{ thoi_gian: '2026-01-01T10:00', GDKV_phan_loai_KH: 'A' }, { thoi_gian: '2026-01-02T10:00', GDKV_phan_loai_KH: 'B' }]),
      row(2, [{ thoi_gian: '2026-01-01T10:00', GDKV_phan_loai_KH: 'A' }, { thoi_gian: '2026-01-02T10:00', GDKV_phan_loai_KH: '' }]),
      row(3, [{ thoi_gian: '2026-02-30T10:00', GDKV_phan_loai_KH: 'A' }, { GDKV_phan_loai_KH: 'B' }, {}], true),
      row(4, [{ thoi_gian: '2026-01-01T03:00:00Z', GDKV_phan_loai_KH: 'A' }, { thoi_gian: '2026-01-01T10:00:00+07:00', GDKV_phan_loai_KH: 'B' }]),
      row(5, [{ thoi_gian: '2026-01-01T10:00', GDKV_phan_loai_KH: 'A' }, { thoi_gian: 'invalid', GDKV_phan_loai_KH: 'B' }]),
      row(6, []),
      row(7, [{ GDKV_phan_loai_KH: 'ƯT1_Tiềm năng' }]),
      row(8, [{ GDKV_phan_loai_KH: 'ƯT2_Quan tâm' }]),
      row(9, [{ GDKV_phan_loai_KH: 'ƯT3_Theo dõi thêm' }]),
      row(10, [{ GDKV_phan_loai_KH: 'KƯT_Không chất lượng' }]),
      row(11, [{ GDKV_phan_loai_KH: 'KH hẹn gọi lại sau' }])
    ];
    let hideAnchor = false;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data = [];
      if (path === '/api/auth/me') data = { user: { id: 1, role: 'SUPER_ADMIN', full_name: 'Quản trị' } };
      else if (path === '/api/field-definitions/entity/leads') data = fields;
      else if (path === '/api/views') data = [{ id: 8, entity: 'leads', usage: 'table', status: 'active' }];
      else if (path === '/api/dynamic/leads/view/8') data = {
        fields: fields.slice(0, 3).map(field => field.key === 'customer_classification' && hideAnchor ? { ...field, visible: false } : field)
      };
      else if (path === '/api/data-lists/12') data = {
        columns_config: [{ key: 'code' }, { key: 'name' }],
        rows: [{ data: { code: 'A', name: 'Nhóm A' } }, { data: { code: 'B', name: 'Nhóm B' } }]
      };
      else if (path === '/api/admin/leads') data = leads;
      await route.fulfill({ json: { success: true, data, pagination: { total: leads.length, totalPages: 1, page: 1, limit: 100 } } });
    });
    await page.goto(`${base}/admin/leads?tab=all`);
    const table = page.locator('table.dynamic-table');
    await expect(table.getByRole('columnheader', { name: 'GĐKV phân loại' })).toBeVisible();
    const headers = await table.locator('thead tr').first().locator('th').allTextContents();
    const getValue = id => table.locator('tbody tr').filter({ has: page.getByRole('link', { name: `LD-${id}`, exact: true }) }).locator('td').nth(headers.indexOf('GĐKV phân loại'));
    expect(headers.indexOf('GĐKV phân loại')).toBe(headers.indexOf('CSKH phân loại') + 1);
    for (const [id, value] of [[1, 'Nhóm B'], [2, '—'], [3, 'Nhóm B'], [4, 'Nhóm B'], [5, 'Nhóm A'], [6, '—']]) {
      await expect(getValue(id)).toHaveText(value);
    }
    for (const [id, color] of [
      [7, 'rgb(220, 252, 231)'],
      [8, 'rgb(255, 237, 213)'],
      [9, 'rgb(254, 249, 195)'],
      [10, 'rgb(229, 231, 235)'],
      [11, 'rgb(232, 228, 205)']
    ]) {
      await expect(getValue(id).locator('.badge')).toHaveCSS('background-color', color);
    }
    for (const tab of ['Cần phân chia', 'Đã phân chia', 'Cần tư vấn lần đầu', 'Đang tư vấn', 'Đã hoàn thành', 'Tất cả']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await expect(table.getByRole('columnheader', { name: 'GĐKV phân loại' })).toBeVisible();
      await expect(getValue(1)).toHaveText('Nhóm B');
    }
    hideAnchor = true;
    await page.reload();
    await expect(table.getByRole('columnheader', { name: 'GĐKV phân loại' })).toBeVisible();
    const hiddenHeaders = await table.locator('thead tr').first().locator('th').allTextContents();
    expect(hiddenHeaders.indexOf('GĐKV phân loại')).toBe(hiddenHeaders.indexOf('Ghi chú') + 1);
    expect(errors).toEqual([]);
  });
}
