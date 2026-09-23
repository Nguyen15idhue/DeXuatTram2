const pool = require('./src/utils/db');
const dataTools = require('./src/services/assistant/dataTools');

const USER = { id: 1, role: 'SUPER_ADMIN' };
const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra !== undefined ? ' | ' + extra : ''));
};
const SECRET_RE = /(AIza[0-9A-Za-z\-_]{20,}|AQ\.[0-9A-Za-z\-_.]{20,}|sk-[A-Za-z0-9]{20,}|api_key\s*[:=]|\b[0-9a-f]{32,}\b)/i;

async function main() {
  const denies = [
    'có bao nhiêu user trong hệ thống',
    'tổng số trạm sạc là bao nhiêu',
    'đếm số đề xuất',
    'có bao nhiêu danh mục dữ liệu',
    'hệ thống có bao nhiêu file',
    'bao nhiêu thông báo',
  ];
  for (const q of denies) {
    const r = await dataTools.lookup(q, USER);
    check(`CHẶN: "${q}"`, r && r.deny === true, r ? (r.deny ? 'deny' : JSON.stringify(r).slice(0, 60)) : 'null');
  }

  const allow = [
    ['có bao nhiêu bài hướng dẫn', /bài hướng dẫn/],
    ['bản đồ đang dùng gì', /Bản đồ đang dùng/],
    ['các loại trường hỗ trợ là gì', /text/],
    ['trạng thái đề xuất gồm những gì', /Đề xuất/],
    ['form tạo đề xuất gồm mấy trường', /form/i],
    ['view danh sách đề xuất có mấy cột', /view/i],
    ['có những nhà cung cấp bản đồ nào', /(Miễn phí|Cần khóa)/],
    ['sau bao lâu ký thành công thì tự tạo trạm', /90/],
    ['dịch vụ địa chỉ đang dùng là gì', /geoapify/i],
    ['mục lục hướng dẫn có gì', /chuyên mục/],
    ['hôm nay là ngày bao nhiêu', /Thời gian hệ thống/],
  ];
  for (const [q, re] of allow) {
    const r = await dataTools.lookup(q, USER);
    const text = r && r.text ? r.text : '';
    check(`CHO PHÉP: "${q}"`, r && !r.deny && !r.error && re.test(text), text.slice(0, 70));
  }

  const mapRes = await dataTools.lookup('bản đồ đang dùng gì', USER);
  check('map_config KHÔNG lộ api_key', mapRes && !/api_key|AIza|tile_url|style_url/i.test(mapRes.text), mapRes && mapRes.text.slice(0, 60));

  const dl = await dataTools.lookup('trường Tỉnh thành điền thế nào', USER);
  check('field_meta datalist ẨN giá trị', dl && /danh mục dữ liệu/.test(dl.text) && !/Hà Nội|Hồ Chí Minh|Đà Nẵng/.test(dl.text), dl && dl.text.slice(0, 90));

  const manual = await dataTools.lookup('trường Loại trụ có những lựa chọn nào', USER);
  check('field_meta manual HIỆN options', manual && /Cột đơn/.test(manual.text), manual && manual.text.slice(0, 90));

  const tdt = await dataTools.lookup('hướng dẫn tôi tạo 1 đề xuất mới, tôi có 1 đề xuất mô hình tự đầu tư, cần nhập thông tin gì', USER);
  check('form_fields TDT đúng mô hình', tdt && /Tự đầu tư \(TDT\)/.test(tdt.text) && /Danh sách trụ/.test(tdt.text) && !/Chính sách/.test(tdt.text), tdt && tdt.text.slice(0, 90));

  const nqlk = await dataTools.lookup('đề xuất mô hình NQ_LK cần nhập thông tin gì', USER);
  check('form_fields NQ_LK có tab lồng', nqlk && /Chính sách/.test(nqlk.text) && /Chi phí/.test(nqlk.text), nqlk && nqlk.text.slice(0, 90));

  const create = await dataTools.lookup('tôi tạo 1 đề xuất mới thì làm ntn, có những trường gì, điền ntn', USER);
  check('form_fields câu "tạo đề xuất mới ... điền ntn"', create && /cần nhập/.test(create.text) && !/\blatitude\b|longitude|55 trường/.test(create.text), create && create.text.slice(0, 90));
  check('form_fields giữ docs khi hỏi quy trình', create && create.skipDocs === false, create && String(create.skipDocs));

  const huy = await dataTools.lookup('lam sao de huy mot de xuat', USER);
  check('KHÔNG nhầm "hủy đề xuất" thành form fields', !huy || !/cần nhập/.test(huy.text || ''), huy && huy.text ? huy.text.slice(0, 60) : 'null');

  const all = [];
  for (const [q] of allow) { const r = await dataTools.lookup(q, USER); if (r && r.text) all.push(r.text); }
  for (const q of denies) { const r = await dataTools.lookup(q, USER); if (r && r.text) all.push(r.text); }
  check('KHÔNG rò secret trong mọi output', !all.some((t) => SECRET_RE.test(t)));

  process.env.ASSISTANT_DATA_TOOLS = 'false';
  const disabled = await dataTools.lookup('có bao nhiêu bài hướng dẫn', USER);
  check('Kill switch tắt toàn bộ tool', disabled === null);
  delete process.env.ASSISTANT_DATA_TOOLS;

  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => { console.error('FATAL', e.message); try { await pool.end(); } catch { /* silent */ } process.exit(2); });
