const { test, expect } = require('@playwright/test');
test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

const pdf = (() => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream'
  ];
  let content = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, value] of objects.entries()) {
    offsets.push(Buffer.byteLength(content));
    content += `${index+1} 0 obj\n${value}\nendobj\n`;
  }
  const xref = Buffer.byteLength(content);
  content += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(content);
})();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXV0AAAAASUVORK5CYII=', 'base64');
const signer = { id: 1, user_id: 1, full_name: 'Người ký 1', status: 'SIGNED', signature_id: 1,
  signed_at: '2026-01-01T01:02:03Z', page: 1, pos_x: .05, pos_y: .3, box_width: .8, box_height: .2,
  signer_department: 'Phòng kinh doanh', document_id: 11 };

async function setup(page, { role = 'SUPER_ADMIN', conflict = false, missing = false, convertFailure = false, uploadFailure = false, invalidPdf = false } = {}) {
  const errors = [], mutations = [];
  const recoveryRuns = [];
  let row = null, active = false, polls = 0;
  const source = { id: 10, original_name: 'BCDX.docx', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  const signing = { id: 20, original_name: 'BCDX.pdf', mime_type: 'application/pdf' };
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('token', 'recovery-fixture'));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    let data = [];
    if (path.endsWith('/auth/me')) data = { user: { id: 1, role, full_name: 'Tester', custom_data: {} } };
    else if (path.endsWith('/admin/proposal-signatures/501')) data = {
      id: 501, status: 'SIGNATURE_PENDING', sign_status: 'DONE', owner_name: 'Tester', custom_data: {},
      signed_file_id: null, signer_total: 1, signer_signed: 1, signers: [signer], report_files: [signing],
      documents: [{ id: 11, source_file_id: 10, signing_file_id: 20, source_file: source, signing_file: signing,
        conversion_status: 'READY', signers: [signer], can_sign: false,
        recovery_id: active ? 22 : null, recovery_file: active ? { ...signing, id: 31 } : null }],
      can_upload_signed: false, can_sign: false
    };
    else if (path.endsWith('/recovery')) {
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        mutations.push({ kind: 'create', ...body });
        if (body.input_method === 'PDF_UPLOAD' && invalidPdf) return route.fulfill({ status:400,contentType:'application/json',
          body:JSON.stringify({ success:false,message:'Không đọc được PDF; file hỏng hoặc có mật khẩu' }) });
        row = { id: 22 + recoveryRuns.length, input_method: body.input_method || 'DOCX_CONVERT', reason: body.reason,
          status: 'PENDING', signers: [signer], created_at: '2026-01-01T01:02:03Z', warnings: [], images: [] };
        if (body.input_method === 'PDF_UPLOAD') Object.assign(row, { status:'DRAFT',base_file_id:30,uploaded_pdf_file_id:78,
          uploaded_pdf_name:'source.pdf',page_sizes:[{width:595,height:842}],images:[{config_id:1,source:'SNAPSHOT'}],
          warnings:['PDF do người dùng tải lên: đối chiếu với DOCX gốc.'] });
        recoveryRuns.push(row);
        data = row;
      } else data = { signers: [signer], history: [...recoveryRuns].reverse(), source_file: source };
    } else if (/\/recovery\/\d+\/activate$/.test(path)) {
      mutations.push({ kind: 'activate', ...request.postDataJSON() });
      if (conflict) return route.fulfill({ status: 409, contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'DOCX đã thay đổi; hãy tạo lượt mới' }) });
      active = !request.postDataJSON().original;
      row.status = active ? 'ACTIVE' : 'CONFIRMED';
      data = { recovery_id: active ? 22 : null };
    } else if (/\/recovery\/\d+$/.test(path)) {
      if (request.method() === 'PUT') {
        const body = request.postDataJSON();
        mutations.push({ kind: 'preview', ...body });
        if (missing && (!body.replacements?.length || !body.replacements[0].reason?.trim())) return route.fulfill({
          status: 409, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Còn thiếu ảnh chữ ký hoặc lý do thay thế' })
        });
        Object.assign(row, { signers: body.signers, preview_file_id: 31,
          images: [{ config_id: 1, source: missing ? 'REPLACEMENT' : 'SNAPSHOT' }] });
      } else if (++polls >= 1 && row.status === 'PENDING') Object.assign(row, convertFailure ? { status:'FAILED',error:'LibreOffice unavailable' } : {
        status: 'DRAFT', base_file_id: 30, page_sizes: [{ width: 595, height: 842 }],
        images: [{ config_id: 1, source: missing ? 'MISSING' : 'SNAPSHOT' }], warnings: ['Thiếu font — đối chiếu lại nội dung DOCX']
      });
      data = row;
    } else if (path.endsWith('/files/upload')) {
      mutations.push({ kind: 'upload' });
      if (uploadFailure) return route.fulfill({ status:500,contentType:'application/json',
        body:JSON.stringify({ success:false,message:'Upload PDF lỗi' }) });
      const isPdf = request.postDataBuffer().includes(Buffer.from('filename="source.pdf"'));
      data = isPdf ? { id:78,original_name:'source.pdf',mime_type:'application/pdf',size:pdf.length }
        : { id: 77, original_name: 'replacement.png', mime_type: 'image/png', size: png.length };
    } else if (/\/files\/\d+\/(preview|download)/.test(path)) {
      return route.fulfill({ contentType: path.includes('/77/') ? 'image/png' : 'application/pdf', body: path.includes('/77/') ? png : pdf });
    } else if (path.includes('/image/') || path.includes('/signature-image/')) {
      return route.fulfill({ contentType: 'image/png', body: png });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  await page.goto('/admin/proposals/trinh-ky/501');
  return { errors, mutations, recoveryRuns };
}

for (const mobile of [false,true]) {
  test(`preview-first recovery freezes original configs and activates PDF: ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const fixture = await setup(page);
    await page.getByRole('button', { name: 'Phục hồi BCĐX đã ký', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Phục hồi BCĐX đã ký' });
    await expect(dialog.getByRole('button', { name: 'Tạo bản phục hồi mới' })).toBeDisabled();
    await dialog.getByLabel('Lý do phục hồi', { exact: true }).fill('PDF cũ convert lỗi');
    await dialog.getByRole('button', { name: 'Tạo bản phục hồi mới' }).click();
    await expect(dialog.getByText('Bản #22: Bản nháp')).toBeVisible();
    await expect(dialog.locator('canvas')).toHaveCount(1);
    await dialog.getByLabel('X (0–1) Người ký 1', { exact: true }).fill('0.1');
    await expect(dialog.getByRole('button', { name: 'Xác nhận dùng bản phục hồi' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Đặt lại vị trí gốc' }).click();
    await expect(dialog.getByLabel('X (0–1) Người ký 1', { exact: true })).toHaveValue('0.05');
    await dialog.getByRole('button', { name: 'Dựng PDF xem trước có chữ ký' }).click();
    await expect(dialog.getByRole('checkbox')).toBeEnabled();
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Xác nhận dùng bản phục hồi' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Đang dùng bản phục hồi #22;', { exact: false })).toBeVisible();
    expect(fixture.mutations.map(item => item.kind)).toEqual(['create','preview','activate']);
    expect(fixture.mutations[1].signers[0].signed_at).toEqual(signer.signed_at);
    expect(fixture.errors).toEqual([]);
  });
}

  for (const mobile of [false,true]) {
    test(`uploaded PDF bypasses converter and requires preview confirmation: ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
      if (mobile) await page.setViewportSize({ width:390,height:844 });
      const fixture = await setup(page, { convertFailure:true });
      await page.getByRole('button', { name:'Phục hồi BCĐX đã ký',exact:true }).click();
      const dialog = page.getByRole('dialog', { name:'Phục hồi BCĐX đã ký' });
      await dialog.getByLabel('Lý do phục hồi', { exact:true }).fill('Xuất PDF bằng Word vì converter lỗi');
      await dialog.getByLabel('Nguồn PDF phục hồi', { exact:true }).selectOption('PDF_UPLOAD');
      await expect(dialog.getByRole('button',{ name:'Tạo bản phục hồi từ PDF' })).toBeDisabled();
      await dialog.locator('input[type=file]').setInputFiles({ name:'source.pdf',mimeType:'application/pdf',buffer:pdf });
      await expect(dialog.locator('.file-upload-list')).toContainText('source.pdf');
      await expect(dialog.getByRole('button',{ name:'Tạo bản phục hồi từ PDF' })).toBeDisabled();
      await dialog.getByLabel('PDF nền đúng DOCX và chưa có chữ ký').check();
      await dialog.getByRole('button',{ name:'Tạo bản phục hồi từ PDF' }).click();
      await expect(dialog.getByText('Bản #22: Bản nháp')).toBeVisible();
      await expect(dialog.getByText('Nguồn bản phục hồi: PDF tải lên · source.pdf')).toBeVisible();
      await expect(dialog.locator('canvas')).toHaveCount(1);
      await expect(dialog.getByRole('button',{ name:'Xác nhận dùng bản phục hồi' })).toBeDisabled();
      await dialog.getByRole('button',{ name:'Dựng PDF xem trước có chữ ký' }).click();
      await dialog.getByLabel('Đã kiểm tra PDF có chữ ký').check();
      await dialog.getByRole('button',{ name:'Xác nhận dùng bản phục hồi' }).click();
      await expect(dialog).not.toBeVisible();
      expect(fixture.mutations.find(item=>item.kind==='create')).toMatchObject({ input_method:'PDF_UPLOAD',uploaded_pdf_file_id:78 });
      expect(fixture.errors).toEqual([]);
    });
  }

  test('convert failure switches to PDF upload, retains reason and failed run history', async ({ page }) => {
    const fixture = await setup(page, { convertFailure:true });
    await page.getByRole('button',{ name:'Phục hồi BCĐX đã ký',exact:true }).click();
    const dialog = page.getByRole('dialog',{ name:'Phục hồi BCĐX đã ký' });
    await dialog.getByLabel('Lý do phục hồi',{exact:true}).fill('Convert sai bố cục');
    await dialog.getByRole('button',{name:'Tạo bản phục hồi mới'}).click();
    await expect(dialog.getByText('LibreOffice unavailable')).toBeVisible();
    await dialog.getByRole('button',{name:'Dùng PDF tải lên thay thế'}).click();
    await expect(dialog.getByLabel('Nguồn PDF phục hồi')).toHaveValue('PDF_UPLOAD');
    await expect(dialog.getByLabel('Lý do phục hồi',{exact:true})).toHaveValue('Convert sai bố cục');
    await dialog.locator('input[type=file]').setInputFiles({name:'source.pdf',mimeType:'application/pdf',buffer:pdf});
    await dialog.getByLabel('PDF nền đúng DOCX và chưa có chữ ký').check();
    await dialog.getByRole('button',{name:'Tạo bản phục hồi từ PDF'}).click();
    await expect(dialog.getByText('Bản #23: Bản nháp')).toBeVisible();
    expect(fixture.recoveryRuns.map(item=>item.status)).toEqual(['FAILED','DRAFT']);
    await expect(dialog.getByLabel('Lịch sử phục hồi').locator('option')).toContainText(['Chọn bản phục hồi','#23 · PDF tải lên · Bản nháp','#22 · Convert DOCX · Convert thất bại']);
    expect(fixture.errors).toEqual([]);
  });

  for (const failure of ['upload','invalid']) {
    test(`PDF ${failure} error keeps modal open and never activates a recovery`, async ({ page }) => {
      const fixture = await setup(page,{ uploadFailure:failure==='upload',invalidPdf:failure==='invalid' });
      await page.getByRole('button',{ name:'Phục hồi BCĐX đã ký',exact:true }).click();
      const dialog = page.getByRole('dialog',{name:'Phục hồi BCĐX đã ký'});
      await dialog.getByLabel('Lý do phục hồi',{exact:true}).fill('Kiểm tra');
      await dialog.getByLabel('Nguồn PDF phục hồi').selectOption('PDF_UPLOAD');
      await dialog.locator('input[type=file]').setInputFiles({name:'source.pdf',mimeType:'application/pdf',buffer:pdf});
      if(failure==='invalid'){
        await dialog.getByLabel('PDF nền đúng DOCX và chưa có chữ ký').check();
        await dialog.getByRole('button',{name:'Tạo bản phục hồi từ PDF'}).click();
        await expect(dialog.getByRole('alert')).toContainText('Không đọc được PDF');
      } else {
        await expect(dialog.getByText('Upload PDF lỗi',{exact:false})).toBeVisible();
        await expect(dialog.getByRole('button',{name:'Tạo bản phục hồi từ PDF'})).toBeDisabled();
      }
      await expect(dialog).toBeVisible();
      expect(fixture.mutations.some(item=>item.kind==='activate')).toBe(false);
      expect(fixture.recoveryRuns).toHaveLength(0);
    });
  }
test('confirmation stays blocked while signed preview is loading or cannot be rendered', async ({ page }) => {
  const fixture = await setup(page);
  let releasePreview, requestSeen;
  const previewGate = new Promise(resolve => { releasePreview = resolve; });
  const requestStarted = new Promise(resolve => { requestSeen = resolve; });
  await page.route('**/api/files/31/preview', async route => {
    requestSeen();
    await previewGate;
    return route.fulfill({ contentType: 'application/pdf', body: Buffer.from('invalid PDF') });
  });
  await page.getByRole('button', { name: 'Phục hồi BCĐX đã ký', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Phục hồi BCĐX đã ký' });
  await dialog.getByLabel('Lý do phục hồi', { exact: true }).fill('Kiểm tra xem trước');
  await dialog.getByRole('button', { name: 'Tạo bản phục hồi mới' }).click();
  await dialog.getByRole('button', { name: 'Dựng PDF xem trước có chữ ký' }).click();
  await requestStarted;
  await expect(dialog.getByLabel('Đã kiểm tra PDF có chữ ký')).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Xác nhận dùng bản phục hồi' })).toBeDisabled();
  releasePreview();
  await expect(dialog.getByRole('alert')).toContainText('Invalid PDF');
  await expect(dialog.getByLabel('Đã kiểm tra PDF có chữ ký')).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Xác nhận dùng bản phục hồi' })).toBeDisabled();
  expect(fixture.mutations.some(item => item.kind === 'activate')).toBe(false);
  expect(fixture.errors).toEqual([]);
});

test('confirm conflict remains visible and never replaces the signing PDF', async ({ page }) => {
  await setup(page, { conflict: true });
  await page.getByRole('button', { name: 'Phục hồi BCĐX đã ký', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Phục hồi BCĐX đã ký' });
  await dialog.getByLabel('Lý do phục hồi', { exact: true }).fill('Kiểm tra');
  await dialog.getByRole('button', { name: 'Tạo bản phục hồi mới' }).click();
  await expect(dialog.getByText('Bản #22: Bản nháp')).toBeVisible();
  await dialog.getByRole('button', { name: 'Dựng PDF xem trước có chữ ký' }).click();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Xác nhận dùng bản phục hồi' }).click();
  await expect(dialog.getByRole('alert')).toContainText('DOCX đã thay đổi');
  await expect(dialog).toBeVisible();
  await expect(page.getByText('Đang dùng bản phục hồi', { exact: false })).toHaveCount(0);
});

test('PDF source upload enforces type and exact 10MB limit before calling API', async ({ page }) => {
  const fixture = await setup(page);
  await page.getByRole('button',{ name:'Phục hồi BCĐX đã ký',exact:true }).click();
  const dialog = page.getByRole('dialog',{ name:'Phục hồi BCĐX đã ký' });
  await dialog.getByLabel('Nguồn PDF phục hồi').selectOption('PDF_UPLOAD');
  await dialog.locator('input[type=file]').setInputFiles({ name:'image.png',mimeType:'image/png',buffer:png });
  await expect(dialog.getByText('File "image.png" không đúng định dạng được chấp nhận')).toBeVisible();
  await dialog.locator('input[type=file]').setInputFiles({ name:'source.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(10*1024*1024+1) });
  await expect(dialog.getByText('File "source.pdf" vượt quá 10MB')).toBeVisible();
  expect(fixture.mutations).toHaveLength(0);
  const boundary = Buffer.alloc(10*1024*1024,32);
  pdf.copy(boundary);
  await dialog.locator('input[type=file]').setInputFiles({ name:'source.pdf',mimeType:'application/pdf',buffer:boundary });
  await expect(dialog.locator('.file-upload-list')).toContainText('source.pdf');
  expect(fixture.mutations.map(item=>item.kind)).toEqual(['upload']);
  expect(fixture.errors).toEqual([]);
});

test('ADMIN cannot see recovery controls', async ({ page }) => {
  const fixture = await setup(page, { role: 'ADMIN' });
  await expect(page.getByRole('heading', { name: /BCĐX|Trình ký|501/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Phục hồi BCĐX đã ký', exact: true })).toHaveCount(0);
  expect(fixture.mutations).toEqual([]);
});

test('missing signature requires replacement image and explicit reason without changing signer identity', async ({ page }) => {
  const fixture = await setup(page, { missing: true });
  await page.getByRole('button', { name: 'Phục hồi BCĐX đã ký', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Phục hồi BCĐX đã ký' });
  await dialog.getByLabel('Lý do phục hồi', { exact: true }).fill('Kiểm tra ảnh legacy thiếu');
  await dialog.getByRole('button', { name: 'Tạo bản phục hồi mới' }).click();
  await expect(dialog.getByText('Nguồn ảnh: Thiếu/hỏng — cần thay thế')).toBeVisible();
  await dialog.getByRole('button', { name: 'Dựng PDF xem trước có chữ ký' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Còn thiếu ảnh chữ ký');
  await dialog.locator('input[type=file]').setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: png });
  await dialog.getByLabel('Lý do thay ảnh Người ký 1', { exact: true }).fill('Ảnh ký lịch sử đã mất; thay trong bản phục hồi');
  await dialog.getByRole('button', { name: 'Dựng PDF xem trước có chữ ký' }).click();
  await expect(dialog.getByText('Nguồn ảnh: REPLACEMENT')).toBeVisible();
  const payload = fixture.mutations.filter(item => item.kind === 'preview').at(-1);
  expect(payload.replacements).toEqual([{ config_id: 1, file_id: 77, reason: 'Ảnh ký lịch sử đã mất; thay trong bản phục hồi' }]);
  expect(payload.signers[0].signed_at).toEqual(signer.signed_at);
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Xác nhận dùng bản phục hồi' }).click();
  await expect(dialog).not.toBeVisible();
  expect(fixture.errors).toEqual([]);
});
