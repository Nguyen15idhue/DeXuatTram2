const pool = require('./src/utils/db');
const proposalService = require('./src/services/proposalService');
const myProposalService = require('./src/services/myProposalService');
const fileService = require('./src/services/fileService');

const API = 'http://localhost:3000';
const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

const png = (seed) => {
  const b = Buffer.alloc(100);
  b[0] = 0x89; b[1] = 0x50; b[2] = 0x4e; b[3] = 0x47; b[4] = 0x0d; b[5] = 0x0a; b[6] = 0x1a; b[7] = 0x0a;
  b.writeUInt32BE(seed, 20);
  return b;
};

async function main() {
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@station.com', password: '123456' })
  });
  const { data: loginData } = await login.json();
  const token = loginData.token;
  check('login admin OK', !!token);

  const upload = async (name, seed) => {
    const fd = new FormData();
    fd.append('file', new Blob([png(seed)], { type: 'image/png' }), name);
    fd.append('originalName', name);
    const r = await fetch(`${API}/api/files/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd
    });
    const b = await r.json();
    if (!b.success) throw new Error(`upload failed: ${b.message}`);
    return b.data;
  };

  const f1 = await upload('anh tu do 1.png', 11);
  const f2 = await upload('ANH TU DO 2.PNG', 22);
  check('upload giu ten tu do ban dau', f1.original_name === 'anh tu do 1.png', `name=${f1.original_name}`);

  const created = await proposalService.createProposal(1, {
    latitude: 10.11, longitude: 106.11,
    owner_name: 'Test Rename', owner_phone: '0900000011', address: 'Test Addr',
    province: 'Thành phố Hà Nội', mo_hinh_dau_tu: 'LK',
    vi_tri_lap_tru: [f1, f2]
  }, { actorRole: 'SUPER_ADMIN' });
  const pid = created.id;
  const ma = created.ma_de_xuat;
  check('tao de xuat co ma', !!ma, `ma=${ma}`);
  const [fr] = await pool.query('SELECT id, original_name FROM files WHERE id IN (?, ?) ORDER BY id', [f1.id, f2.id]);
  const exp1 = `${ma}_Ảnh vị trí dự kiến lắp đặt trụ sạc_1.png`;
  const exp2 = `${ma}_Ảnh vị trí dự kiến lắp đặt trụ sạc_2.PNG`;
  check('file1 doi ten chuan + giu ext', fr[0].original_name === exp1, `name=${fr[0].original_name}`);
  check('file2 doi ten chuan + giu ext hoa', fr[1].original_name === exp2, `name=${fr[1].original_name}`);
  const [pr] = await pool.query('SELECT custom_data FROM station_proposals WHERE id = ?', [pid]);
  const cd = typeof pr[0].custom_data === 'string' ? JSON.parse(pr[0].custom_data) : pr[0].custom_data;
  check('ten nhung trong custom_data duoc cap nhat', cd.vi_tri_lap_tru[0].original_name === exp1 && cd.vi_tri_lap_tru[1].original_name === exp2);

  const dl = await fetch(`${API}/api/files/${f1.id}/download?token=${encodeURIComponent(token)}`);
  const disp = dl.headers.get('content-disposition') || '';
  check('download tra ten moi', dl.status === 200 && disp.includes(encodeURIComponent(exp1).slice(0, 20)), `status=${dl.status}`);

  const f3 = await upload('file thu ba.png', 33);
  await myProposalService.updateProposal(pid, 1, {
    owner_name: 'Test Rename', owner_phone: '0900000011', address: 'Test Addr',
    province: 'Thành phố Hà Nội', mo_hinh_dau_tu: 'LK',
    vi_tri_lap_tru: [{ id: f1.id }, { id: f2.id }, f3]
  }, { actorRole: 'SUPER_ADMIN' });
  const [fr2] = await pool.query('SELECT id, original_name FROM files WHERE id IN (?, ?, ?) ORDER BY id', [f1.id, f2.id, f3.id]);
  const exp3 = `${ma}_Ảnh vị trí dự kiến lắp đặt trụ sạc_3.png`;
  check('ten cu on dinh khi them file (idempotent)', fr2[0].original_name === exp1 && fr2[1].original_name === exp2, `${fr2[0].original_name}`);
  check('file moi danh STT tiep theo', fr2[2].original_name === exp3, `name=${fr2[2].original_name}`);

  await myProposalService.updateProposal(pid, 1, {
    owner_name: 'Test Rename', owner_phone: '0900000011', address: 'Test Addr',
    province: 'Thành phố Hà Nội', mo_hinh_dau_tu: 'LK',
    vi_tri_lap_tru: [{ id: f2.id }, { id: f3.id }]
  }, { actorRole: 'SUPER_ADMIN' });
  const [fr3] = await pool.query('SELECT id, original_name FROM files WHERE id IN (?, ?) ORDER BY id', [f2.id, f3.id]);
  check('xoa file giua thi danh lai STT theo vi tri', fr3[0].original_name === `${ma}_Ảnh vị trí dự kiến lắp đặt trụ sạc_1.PNG` && fr3[1].original_name === `${ma}_Ảnh vị trí dự kiến lắp đặt trụ sạc_2.png`, `${fr3[0].original_name} | ${fr3[1].original_name}`);

  for (const f of [f1, f2, f3]) { try { await fileService.deleteFile(f.id); } catch { /* silent */ } }
  await pool.query('DELETE FROM proposal_activity_logs WHERE proposal_id = ?', [pid]);
  await pool.query("DELETE FROM notifications WHERE entity_type = 'station_proposals' AND entity_id = ?", [pid]);
  await pool.query('DELETE FROM station_proposals WHERE id = ?', [pid]);

  const failed = results.filter((x) => !x.ok).length;
  console.log(`\nTOTAL ${results.length}, FAILED ${failed}`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => { console.error('FATAL', e.message); try { await pool.end(); } catch { /* silent */ } process.exit(2); });
