const API = 'http://localhost:3000';
const results = [];
const check = (n, c, x = '') => results.push(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' | ' + x : ''}`);
async function main() {
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@station.com', password: '123456' })
  });
  const token = (await login.json()).data.token;
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  let r = await fetch(`${API}/api/admin/webhook-configs`, {
    method: 'POST', headers: H, body: JSON.stringify({ name: 'SCRATCH48-WH', note: 'test' })
  });
  let j = await r.json();
  const wid = j.data && j.data.id;
  const sec = j.data && j.data.secret;
  check('tao webhook + plaintext 1 lan', r.status === 201 && !!wid && /^[0-9a-f]{64}$/.test(sec || ''), `id=${wid}`);

  r = await fetch(`${API}/api/admin/webhook-configs`, { headers: { Authorization: `Bearer ${token}` } });
  j = await r.json();
  const row = (j.data || []).find(x => x.id === wid) || {};
  check('list masked', row.secret_set === true && !row.secret && !row.secret_prev, JSON.stringify(row));

  // secret moi dung duoc
  const hook = async (s, body) => {
    const rr = await fetch(`${API}/api/webhooks/oneoffice/proposal-status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s}` },
      body: JSON.stringify(body)
    });
    return rr.status;
  };
  let st = await hook(sec, { event_id: `evt48-wh-${Date.now()}`, event: 'APPROVED', proposal_code: 'NOPE' });
  check('secret bang moi 404 ma (qua auth)', st === 404, `http=${st}`);

  // rotate
  r = await fetch(`${API}/api/admin/webhook-configs/${wid}/rotate`, { method: 'POST', headers: H, body: '{}' });
  j = await r.json();
  const sec2 = j.data && j.data.webhook_secret;
  check('rotate plaintext', r.status === 200 && /^[0-9a-f]{64}$/.test(sec2 || '') && sec2 !== sec);
  st = await hook(sec, { event_id: `evt48-wh2-${Date.now()}`, event: 'APPROVED', proposal_code: 'NOPE' });
  check('secret cu van qua (grace)', st === 404, `http=${st}`);
  st = await hook(sec2, { event_id: `evt48-wh3-${Date.now()}`, event: 'APPROVED', proposal_code: 'NOPE' });
  check('secret moi qua', st === 404, `http=${st}`);

  // tat -> 401
  r = await fetch(`${API}/api/admin/webhook-configs/${wid}/active`, { method: 'PUT', headers: H, body: JSON.stringify({ is_active: false }) });
  check('tat 200', r.status === 200);
  st = await hook(sec2, { event_id: `evt48-wh4-${Date.now()}`, event: 'APPROVED', proposal_code: 'NOPE' });
  check('tat thi 401', st === 401, `http=${st}`);
  await fetch(`${API}/api/admin/webhook-configs/${wid}/active`, { method: 'PUT', headers: H, body: JSON.stringify({ is_active: true }) });

  // test-send
  r = await fetch(`${API}/api/admin/webhook-configs/test-send`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ event: 'APPROVED', proposal_code: 'NOPE' })
  });
  check('test-send 404 ma la', r.status === 404, `http=${r.status}`);

  // xoa
  r = await fetch(`${API}/api/admin/webhook-configs/${wid}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  check('xoa 200', r.status === 200);
  st = await hook(sec2, { event_id: `evt48-wh5-${Date.now()}`, event: 'APPROVED', proposal_code: 'NOPE' });
  check('xoa xong 401', st === 401, `http=${st}`);

  console.log(results.join('\n'));
}
main().catch(e => { console.error('SCRIPT ERROR', e.message); process.exit(1); });
