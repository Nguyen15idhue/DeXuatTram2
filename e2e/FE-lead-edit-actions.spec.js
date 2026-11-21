const { test, expect } = require('@playwright/test');
const base = process.env.E2E_BASE_URL || 'http://localhost:5173';

const leadFields = [
  { key: 'full_name', label: 'Họ và tên', type: 'text', required: true },
  { key: 'phone', label: 'Số điện thoại', type: 'phone', required: true },
  { key: 'customer_classification', label: 'Phân loại khách hàng', type: 'select',
    options: [{ value: 'ut1', label: 'ƯT1_Tiềm năng', color: '#4ade80' }, { value: 'ut2', label: 'ƯT2_Quan tâm' }] },
  { key: 'sales_outcome', label: 'Kết quả tư vấn cuối cùng', type: 'select',
    options: [{ value: 'SUCCESS', label: '1. Gửi vị trí đề xuất' }, { value: 'FAILED', label: '2. Không làm' }] },
  { key: 'note', label: 'Ghi chú khách hàng', type: 'textarea' },
  { key: 'tvbh_history', label: 'Lịch sử tư vấn', type: 'table', source_config: {
    columns: [{ key: 'GDKV_phan_loai_KH', label: 'GĐKV phân loại KH', column_type: 'select',
      options: ['ƯT1_Tiềm năng', 'ƯT2_Quan tâm', 'ƯT3_Theo dõi thêm', 'KƯT_Không chất lượng', 'KH không nghe máy', 'KH hẹn gọi lại sau'] },
    { key: 'ghi_chu', label: 'Ghi chú', column_type: 'text' }]
  } }
];
const proposalFields = [
  { key: 'owner_name', label: 'Họ và tên', type: 'text' },
  { key: 'owner_phone', label: 'Số điện thoại', type: 'phone' }
];

function formConfig(id, definitions) {
  const rows = definitions.map((_, index) => ({ id: `row${index}`, columns: '1:1' }));
  return {
    form: { id, layout_config: { rows } },
    fields: definitions.map((field, index) => ({ ...field, config: { rowId: rows[index].id, colIndex: 0 } })),
  };
}

async function openLead(page, { canConsult = true, mode = 'edit', notes = {}, classifications = [], authUser = {} } = {}) {
  const user = { id: 501, role: 'SUPER_ADMIN', full_name: 'Quản trị thử nghiệm', ...authUser };
  let lead = {
    id: 17, lead_code: 'LD-000017', full_name: 'Khách mẫu', phone: '0900000000',
    customer_classification: null, sales_outcome: null, consultation_status: 'CONSULTING',
    tvbh_history: [{ GDKV_phan_loai_KH: '' }], custom_data: {},
    permissions: { can_view: true, can_consult: canConsult, can_assign: true, can_write_general: true },
    ...notes
  };
  const state = { failSave: false, updates: [], proposals: [] };
  await page.addInitScript(() => localStorage.setItem('token', 'lead-edit-fixture'));
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const { pathname } = new URL(req.url());
    let data = [];
    if (pathname === '/api/auth/me') data = { user };
    if (pathname === '/api/admin/excel/views') data = [{ id: 28, name: 'Danh sách Lead đầy đủ', usage: 'excel_full' }];
    if (pathname === '/api/field-definitions/entity/leads') data = leadFields;
    if (pathname === '/api/forms/by-entity-purpose') data = { id: 19 };
    if (pathname === '/api/forms/19') data = { id: 19, fields: leadFields };
    if (pathname === '/api/forms/quick-create') data = { id: 83 };
    if (pathname === '/api/dynamic/leads/form/19') data = formConfig(19, leadFields);
    if (pathname === '/api/dynamic/station_proposals/form/83') data = formConfig(83, proposalFields);
    if (pathname === '/api/admin/leads') data = [lead, ...classifications.map((classification, index) => ({
      ...lead, id: 18 + index, lead_code: `LD-${String(18 + index).padStart(6, '0')}`, customer_classification: classification
    }))];
    if (mode !== 'edit' && pathname === '/api/views') data = [{ id: 8 }];
    if (mode !== 'edit' && pathname === '/api/dynamic/leads/view/8') {
      const fields = [{ key: 'lead_code', label: 'Mã Lead', type: 'text' }, ...leadFields]
        .map((field) => ({ ...field, field_key: field.key, visible: true }));
      data = { fields, allFields: fields };
    }
    if (pathname === '/api/admin/leads/17') {
      if (req.method() === 'PUT') {
        const update = req.postDataJSON();
        state.updates.push(update);
        if (state.failSave) return route.fulfill({ status: 422, json: { success: false, message: 'Không lưu được hồ sơ mẫu' } });
        lead = { ...lead, ...update, consultation_status: update.sales_outcome || lead.consultation_status };
      }
      data = lead;
    }
    if (pathname === '/api/admin/leads/17/create-proposal') {
      state.proposals.push(req.postDataJSON());
      data = { id: 29 };
    }
    await route.fulfill({ json: { success: true, data, pagination: { total: 1, totalPages: 1, page: 1 } } });
  });
  await page.goto(`${base}/admin/leads${mode === 'list' ? '?tab=consulting' : mode === 'default-list' ? '' : `/${mode}=17`}`);
  if (mode === 'edit') await expect(page.locator('#lead-edit-form .dynamic-field-select').first()).toBeVisible();
  return state;
}

async function checkReadOnlyLeadExport(page, department) {
  await openLead(page, {
    mode: 'default-list',
    authUser: { role: 'SALES', department, chuc_vu: 'Chuyên viên' },
    notes: { assigned_department: 'Trung tâm KD miền Bắc' }
  });
  await page.route(/\/api\/admin\/excel\/export\/leads\?/, async route => {
    expect(new URL(route.request().url()).searchParams.get('tab')).toBe('all');
    await route.fulfill({
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      headers: { 'content-disposition': 'attachment; filename="leads.xlsx"' },
      body: 'mock download'
    });
  });
  await expect(page.getByRole('tab', { name: 'Tất cả', exact: true })).toHaveAttribute('aria-selected', 'true');
  const code = page.getByRole('link', { name: 'LD-000017' });
  await expect(code).toBeVisible();
  for (const name of ['Thêm Lead', 'Nhập Excel', 'Sửa', 'Xóa', 'Phân chia']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Xuất Excel', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Danh sách Lead đầy đủ/ }).click();
  expect((await download).suggestedFilename()).toBe('leads.xlsx');
  await code.click();
  await expect(page.getByRole('heading', { name: 'Lead #17', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sửa', exact: true })).toHaveCount(0);
}

test('Executive Office staff can view all and download Excel without seeing write actions', async ({ page }) => {
  await checkReadOnlyLeadExport(page, 'Ban Tổng Giám đốc');
});

test('Distributor SALES can view all and download Excel without seeing write actions', async ({ page }) => {
  await checkReadOnlyLeadExport(page, 'Kênh Nhà phân phối');
});

async function choose(page, index, label) {
  const field = page.locator('#lead-edit-form .dynamic-field-select').nth(index);
  await field.locator(':scope > div').first().click();
  await field.locator('.dynamic-select-dropdown').getByText(label, { exact: true }).click();
}

test('switches CTA, keeps the draft on failure, and prefills from the saved Lead without creating on open', async ({ page }) => {
  const state = await openLead(page);
  const normalSave = page.getByRole('button', { name: 'Lưu', exact: true });
  await expect(normalSave).toBeVisible();
  await choose(page, 1, '1. Gửi vị trí đề xuất');
  await expect(normalSave).toHaveCount(0);
  const saveAndCreate = page.getByRole('button', { name: 'Lưu và tạo đề xuất' });
  await expect(saveAndCreate).toBeVisible();
  await choose(page, 1, '2. Không làm');
  await expect(normalSave).toBeVisible();
  await choose(page, 1, '1. Gửi vị trí đề xuất');

  const inputs = page.locator('#lead-edit-form input');
  await inputs.nth(0).fill('Khách vừa cập nhật');
  await inputs.nth(1).fill('0912345678');
  state.failSave = true;
  await saveAndCreate.click();
  const modal = page.locator('dialog').filter({ hasText: 'Tạo nhanh đề xuất từ Lead #17' });
  await expect(page.getByText('Không lưu được hồ sơ mẫu').first()).toBeVisible();
  await expect(modal).toHaveCount(0);
  await expect(inputs.nth(0)).toHaveValue('Khách vừa cập nhật');

  state.failSave = false;
  await saveAndCreate.click();
  await expect(modal).toBeVisible();
  await expect(modal.locator('form input').nth(0)).toHaveValue('Khách vừa cập nhật');
  await expect(modal.locator('form input').nth(1)).toHaveValue('0912345678');
  expect(state.updates).toHaveLength(2);
  expect(state.updates[1].sales_outcome).toBe('SUCCESS');
  await modal.getByRole('button', { name: 'Hủy' }).click();
  await expect(modal).toHaveCount(0);
  expect(state.proposals).toHaveLength(0);
  await expect(page).toHaveURL(/\/view=17(?:\?|$)/);
});

test('shows draft classification and the priority explanations without changing the selection on hover', async ({ page }) => {
  await openLead(page);
  const badge = page.locator('.popup-header [aria-label="Phân loại khách hàng"]');
  await expect(badge).toHaveText('Chưa phân loại');
  await choose(page, 0, 'ƯT1_Tiềm năng');
  await expect(badge).toHaveText('ƯT2_Tiềm năng');
  await choose(page, 0, 'ƯT2_Quan tâm');
  await expect(badge).toHaveText('ƯT1_Quan tâm');

  const priority = page.getByRole('button', { name: 'GĐKV phân loại KH: -- Chọn --' });
  await priority.click();
  const tooltip = page.getByRole('tooltip');
  for (const [label, description] of [
    ['ƯT1_Tiềm năng', 'có sẵn nguồn điện'],
    ['ƯT2_Quan tâm', 'chưa có nguồn điện'],
    ['ƯT3_Theo dõi thêm', 'chỉ muốn cho thuê mặt bằng'],
    ['KƯT_Không chất lượng', 'thông tin không dùng được']
  ]) {
    const option = page.getByRole('button', { name: label, exact: true });
    await option.hover();
    await expect(tooltip).toContainText(description);
    const optionBox = await option.boundingBox();
    const tooltipBox = await tooltip.boundingBox();
    expect(tooltipBox.x >= optionBox.x + optionBox.width || tooltipBox.x + tooltipBox.width <= optionBox.x).toBe(true);
    await expect(option).toHaveAttribute('aria-pressed', 'false');
  }
  await page.getByRole('button', { name: 'KH không nghe máy', exact: true }).hover();
  await expect(tooltip).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await expect(tooltip).toContainText('có sẵn nguồn điện');
  await page.keyboard.press('Escape');
  await expect(priority).toBeVisible();
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(badge).toHaveText('Chưa phân loại');
});

for (const [stored, label] of [['QUAN_TAM', 'ƯT1_Quan tâm'], ['TIEM_NANG', 'ƯT2_Tiềm năng']]) {
  test(`shows the header label for stored classification ${stored}`, async ({ page }) => {
    await openLead(page, { notes: { customer_classification: stored } });
    await expect(page.locator('.popup-header [aria-label="Phân loại khách hàng"]')).toHaveText(label);
  });
}

test('keeps the normal save action without consultation permission', async ({ page }) => {
  await openLead(page, { canConsult: false });
  await choose(page, 1, '1. Gửi vị trí đề xuất');
  await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu và tạo đề xuất' })).toHaveCount(0);
});

test('shows complete multiline notes and history notes in the Lead detail', async ({ page }) => {
  const note = `Dòng đầu ghi chú hồ sơ\n${'x'.repeat(280)}\nDòng cuối ghi chú hồ sơ`;
  const historyNote = `Dòng đầu lịch sử\n${'y'.repeat(240)}\nDòng cuối lịch sử`;
  await page.setViewportSize({ width: 390, height: 844 });
  await openLead(page, { mode: 'view', notes: { note, tvbh_history: [{ GDKV_phan_loai_KH: 'ƯT2', ghi_chu: historyNote }] } });

  const popup = page.locator('.popup-detail');
  for (const [end, content] of [['Dòng cuối ghi chú hồ sơ', note], ['Dòng cuối lịch sử', historyNote]]) {
    const text = popup.getByText(end);
    await expect(text).toBeVisible();
    expect(await text.textContent()).toBe(content);
    await expect(text).toHaveCSS('white-space', 'pre-wrap');
    await expect(text).toHaveCSS('overflow-wrap', 'anywhere');
  }
});

test('opens the Lead by code without leaving its tab and displays current and legacy classifications', async ({ page }) => {
  await openLead(page, {
    mode: 'list',
    notes: { customer_classification: 'TIEM_NANG' },
    classifications: ['Quan tâm', 'ut1', 'ut2', 'Theo dõi thêm', null],
  });
  const table = page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'Mã Lead' }) });
  const code = table.getByRole('link', { name: 'LD-000017' });
  await expect(code).toHaveAttribute('href', '/admin/leads/view=17?tab=consulting');
  await expect(table.getByRole('button', { name: 'Xem', exact: true })).toHaveCount(0);
  await expect(table.getByRole('button', { name: 'Sửa', exact: true }).first()).toBeVisible();
  await expect(table.locator('.badge-success').filter({ hasText: 'ƯT1_tiềm năng' })).toHaveCount(2);
  await expect(table.locator('.badge-warning').filter({ hasText: 'ƯT2_quan tâm' })).toHaveCount(2);
  await expect(table.getByText('Theo dõi thêm', { exact: true })).toBeVisible();
  await code.click();
  await expect(page.getByRole('heading', { name: 'Lead #17', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/view=17\?tab=consulting$/);
  await page.locator('.popup-detail').getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await expect(page).toHaveURL(/\/admin\/leads\?tab=consulting$/);
});

test('refreshes history classification after saving a lead', async ({ page }) => {
  await openLead(page, { mode: 'list' });
  const table = page.locator('table.dynamic-table');
  const leadRow = table.locator('tbody tr').filter({ has: page.getByRole('link', { name: 'LD-000017' }) });
  await expect(leadRow.getByText('—', { exact: true })).toBeVisible();
  await leadRow.getByRole('button', { name: 'Cập nhật', exact: true }).click();
  await page.getByRole('button', { name: 'GĐKV phân loại KH: -- Chọn --' }).click();
  await page.getByRole('button', { name: 'ƯT2_Quan tâm', exact: true }).click();
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(leadRow.getByText('ƯT2_Quan tâm', { exact: true })).toHaveCount(1);
});

test.describe('touch device', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('shows inline priority descriptions and saves the original option value', async ({ page }) => {
    const state = await openLead(page);
    await page.getByRole('button', { name: 'GĐKV phân loại KH: -- Chọn --' }).tap();
    const option = page.getByRole('button', { name: 'ƯT2_Quan tâm', exact: true });
    await expect(option.getByText(/chưa có nguồn điện/)).toBeInViewport();
    await option.tap();
    await expect(page.getByRole('button', { name: 'GĐKV phân loại KH: ƯT2_Quan tâm' })).toBeVisible();
    await page.getByRole('button', { name: 'Lưu', exact: true }).tap();
    await expect(page).toHaveURL(/\/view=17(?:\?|$)/);
    expect(state.updates[0].tvbh_history).toEqual([{ GDKV_phan_loai_KH: 'ƯT2_Quan tâm' }]);
  });
});
