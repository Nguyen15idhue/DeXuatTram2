const API = process.env.API_BASE || 'http://localhost:3000';

const CASES = [
  { q: 'Lam sao de huy mot de xuat?', expect: 'huy-de-xuat-cancelled' },
  { q: 'Toi muon huy de xuat tu trang thai da duyet thi lam the nao?', expect: 'huy-de-xuat-cancelled' },
  { q: 'Luu tru de xuat la gi?', expect: 'de-xuat-luu-tru-archived' },
  { q: 'Trang thai da luu tru khac gi da duyet?', expect: 'de-xuat-luu-tru-archived' },
  { q: 'Tao nhanh de xuat o dau?', expect: 'tao-nhanh-de-xuat' },
  { q: 'Mo hinh NQ_LK nhap o dau?', expect: 'mo-hinh-nq-lk' },
  { q: 'Nhuong quyen va lien ket co may tab?', expect: 'mo-hinh-nq-lk' },
  { q: 'Bang chi phi lien ket nhap the nao?', expect: 'bang-chi-phi-lk' },
  { q: 'Loai dat co nhung lua chon nao?', expect: 'loai-dat' },
  { q: 'Cap 1 va cap 2 la gi?', expect: 'loai-uu-tien-cap-1-2' },
  { q: 'Lam sao biet de xuat nao uu tien cap 1?', expect: 'loai-uu-tien-cap-1-2' },
  { q: 'Cay nhan su GDTT GDKV CTV hoat dong the nao?', expect: 'cay-nhan-su-gdkv-gdtt' },
  { q: 'Khi tao user thi gan nhanh cho ai?', expect: 'cay-nhan-su-gdkv-gdtt' },
  { q: 'Ghi nho dang nhap 30 ngay la gi?', expect: 'ghi-nho-dang-nhap-30-ngay' },
  { q: 'Dang nhap bang so dien thoai duoc khong?', expect: 'ghi-nho-dang-nhap-30-ngay' },
  { q: 'Khach khong co tai khoan gui de xuat duoc khong?', expect: 'de-xuat-khach-guest' },
  { q: 'Tra cuu tinh trang de xuat bang ma gi?', expect: 'de-xuat-khach-guest' },
  { q: 'Tab Tat ca trong chuong thong bao la gi?', expect: 'chuong-thong-bao-gop' },
  { q: 'Doi nen ban do sang ve tinh nhu the nao?', expect: 'nen-ban-do-che-do-3d' },
  { q: 'Tao tram nhanh tu ban do bang cach nao?', expect: 'tao-tram-nhanh-tu-ban-do' },
];

async function main() {
  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@station.com', password: '123456' }),
  });
  const login = await loginRes.json();
  const token = login?.data?.token;
  if (!token) throw new Error('khong dang nhap duoc: ' + JSON.stringify(login).slice(0, 200));

  let correct = 0;
  let withSources = 0;
  const rows = [];
  for (const c of CASES) {
    const started = Date.now();
    const res = await fetch(`${API}/api/assistant/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ question: c.q }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const label = res.status === 429 ? 'RATE_LIMIT' : (res.status === 503 ? 'OVERLOAD' : `HTTP_${res.status}`);
      rows.push({ ok: false, q: c.q, expect: c.expect, provider: label, n: 0, ms: Date.now() - started, top: '' });
      console.log(`| ${rows.length} | ❌ | ${c.q} | ${c.expect} | ${label} | - | ${Date.now() - started} | - |`);
      continue;
    }
    const d = (body && body.data) || {};
    const srcSlugs = (d.sources || []).map((s) => s.slug);
    const answer = String(d.answer || '');
    const hit = srcSlugs.includes(c.expect) || answer.includes(c.expect) || srcSlugs.some((s) => s.startsWith(c.expect));
    const refused = /không tìm thấy|không có thông tin/i.test(answer) && srcSlugs.length === 0;
    const overload = /tạm quá tải|chatbot chưa được cấu hình/i.test(answer);
    const realAnswer = !!d.provider && !overload;
    const ok = hit && !refused && realAnswer;
    if (srcSlugs.length > 0) withSources += 1;
    if (ok) correct += 1;
    rows.push({ ok, q: c.q, expect: c.expect, provider: d.provider || (overload ? 'OVERLOAD' : '-'), n: srcSlugs.length, ms: Date.now() - started, top: srcSlugs.slice(0, 2).join(',') });
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log('| # | OK | Câu hỏi | Kỳ vọng | Provider | #Nguồn | ms | Top nguồn |');
  console.log('|---|---|---|---|---|---|---|---|');
  rows.forEach((r, i) => {
    console.log(`| ${i + 1} | ${r.ok ? '✅' : '❌'} | ${r.q} | ${r.expect} | ${r.provider} | ${r.n} | ${r.ms} | ${r.top} |`);
  });
  const total = CASES.length;
  console.log(`\n[EVAL] correct=${correct}/${total} withSources=${withSources}/${total}`);
  process.exit(correct >= 18 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
