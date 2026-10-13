const http = require('http');

const SIG = process.env.BPA_SIM_SIGNATURE || '';
const TOKEN = process.env.ONEOFFICE_TEST_TOKEN || '';
if (!SIG || !TOKEN) {
  console.log('Thieu env BPA_SIM_SIGNATURE / ONEOFFICE_TEST_TOKEN. VD (PowerShell):');
  console.log("$env:BPA_SIM_SIGNATURE='<X-1Office-Signature>'; $env:ONEOFFICE_TEST_TOKEN='<access_token>'; node test-bpa-sim.cjs");
  process.exit(2);
}

function bpaNode(body) {
  return new Promise((resolve) => {
    const data = new URLSearchParams(body).toString();
    const req = http.request({
      host: 'localhost', port: 3000,
      path: '/api/webhooks/oneoffice/work-process/move-to-project',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': Buffer.byteLength(data),
        'X-1Office-Signature': SIG
      }
    }, (r) => {
      let b = '';
      r.on('data', (c) => { b += c; });
      r.on('end', () => resolve({ status: r.statusCode, body: b }));
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.write(data);
    req.end();
  });
}

function oneOfficeGet(path) {
  return new Promise((resolve) => {
    http.get(`http://egr.1office.vn${path}access_token=${TOKEN}`, (r) => {
      let b = '';
      r.on('data', (c) => { b += c; });
      r.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({ raw: b.slice(0, 200) }); } });
    }).on('error', (e) => resolve({ error: e.message }));
  });
}

async function main() {
  console.log('=== A. Dung spec (ID=1185, project_id=2, KHONG access_token) ===');
  const a = await bpaNode({ ID: '1185', project_id: '2' });
  console.log('HTTP:', a.status);
  console.log('Body:', (a.body || '').slice(0, 300));

  console.log('');
  console.log('=== B. Co access_token kem (gia dinh BPA gui kem) ===');
  const b = await bpaNode({ ID: '1185', project_id: '2', access_token: TOKEN });
  console.log('HTTP:', b.status);
  let jb = null;
  try { jb = JSON.parse(b.body); } catch { console.log('Body (non-JSON):', (b.body || '').slice(0, 300)); }
  if (jb) {
    console.log('error:', jb.error, '| preventDefault:', jb.preventDefault, '| mode:', jb.mode, '| postId:', jb.postId);
    console.log('postId != 0 ?', jb.postId !== 0 && jb.postId !== '0');
    if (jb.data) console.log('data.project_id:', jb.data.project_id, '| date_updated:', jb.data.date_updated);
  }

  console.log('');
  console.log('=== C. Trang thai THUC tren 1Office sau goi (GET item 1185) ===');
  const item = await oneOfficeGet('/api/work/process/item?ID=1185&');
  const d = item.data || {};
  console.log('project_code:', d.project_code, '| project_title:', d.project_title, '| project_id:', d.project_id);
}
main().catch((e) => { console.log('FATAL:', e.message); process.exit(1); });
