const API = 'http://localhost:3000';
const CONFIG_ID = 3;
const ketQua = [];
const ghi = (ten, ok, chiTiet = '') => {
  ketQua.push({ ten, ok, chiTiet });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${ten}${chiTiet ? ' - ' + chiTiet : ''}`);
};

async function goi(path, opts = {}, token) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(API + path, { ...opts, headers });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

async function main() {
  const dangNhap = await fetch(API + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@station.com', password: '123456' })
  }).then(r => r.json());
  const token = dangNhap.data?.token;
  ghi('Đăng nhập super admin', !!token);

  const loai = await goi('/api/admin/field-mappings/types', {}, token);
  const ds = loai.body?.data?.oneOfficeFields || [];
  const files = ds.find(f => f.key === 'files');
  const desc = ds.find(f => f.key === 'desc');
  const gender = ds.find(f => f.key === 'gender');
  ghi('getTypes có field đặc biệt files', !!files && files.special === true, JSON.stringify(files || null));
  ghi('getTypes đánh dấu desc special', !!desc && desc.special === true, JSON.stringify(desc ? { key: desc.key, special: desc.special } : null));
  ghi('getTypes đánh dấu gender unsupported', !!gender && gender.unsupported === true, JSON.stringify(gender ? { key: gender.key, unsupported: gender.unsupported } : null));
  ghi('getTypes trả unsupportedTargets', Array.isArray(loai.body?.data?.unsupportedTargets) && loai.body.data.unsupportedTargets.includes('region'), JSON.stringify(loai.body?.data?.unsupportedTargets || null));

  const tam = Date.now().toString().slice(-6);
  const srcA = 'owner_name';
  const srcB = 'address';
  const t1 = 'formal_name_' + tam;
  const t2 = 'birthday_' + tam;

  const tao1 = await goi(`/api/admin/field-mappings/${CONFIG_ID}`, { method: 'POST', body: JSON.stringify({ source_field: srcA, target_field: t1, target_field_type: 'text' }) }, token);
  ghi('Tạo mapping nguồn A -> target 1', tao1.status === 201 && tao1.body?.success, `status=${tao1.status}`);
  const id1 = tao1.body?.data?.id;

  const tao2 = await goi(`/api/admin/field-mappings/${CONFIG_ID}`, { method: 'POST', body: JSON.stringify({ source_field: srcA, target_field: t2, target_field_type: 'text' }) }, token);
  ghi('Tạo mapping nguồn A -> target 2 (nguồn lặp OK)', tao2.status === 201 && tao2.body?.success, `status=${tao2.status}`);
  const id2 = tao2.body?.data?.id;

  const taoTrungTarget = await goi(`/api/admin/field-mappings/${CONFIG_ID}`, { method: 'POST', body: JSON.stringify({ source_field: srcB, target_field: t1, target_field_type: 'text' }) }, token);
  ghi('Tạo mapping trùng target -> 400', taoTrungTarget.status === 400, `status=${taoTrungTarget.status} msg=${taoTrungTarget.body?.message || ''}`);

  const doiTrung = await goi(`/api/admin/field-mappings/${id2}`, { method: 'PUT', body: JSON.stringify({ target_field: t1 }) }, token);
  ghi('Đổi target sang target đã có -> 400', doiTrung.status === 400, `status=${doiTrung.status} msg=${doiTrung.body?.message || ''}`);

  const nguonLap = await goi(`/api/admin/field-mappings/${CONFIG_ID}`, { method: 'POST', body: JSON.stringify({ source_field: srcA, target_field: 'tax_number_' + tam, target_field_type: 'text' }) }, token);
  const id3 = nguonLap.body?.data?.id;
  ghi('Nguồn A map thêm target 3 OK', nguonLap.status === 201, `status=${nguonLap.status}`);

  const giuDirection = await goi(`/api/admin/field-mappings/${id1}`, {}, token);
  ghi('Chi tiết mapping đọc được', giuDirection.status === 200, `direction=${giuDirection.body?.data?.direction}`);

  for (const id of [id1, id2, id3]) {
    if (id) await goi(`/api/admin/field-mappings/${id}`, { method: 'DELETE' }, token);
  }
  ghi('Đã dọn mapping test', true);

  const thatBai = ketQua.filter(x => !x.ok);
  console.log(`\nTỔNG ${ketQua.length}, THẤT BẠI ${thatBai.length}`);
  require('fs').writeFileSync('test-29-phase2-results.json', JSON.stringify(ketQua, null, 2));
  process.exit(thatBai.length ? 1 : 0);
}

main().catch(e => { console.error('LỖI', e); process.exit(1); });
