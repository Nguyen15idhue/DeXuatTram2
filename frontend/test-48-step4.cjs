const API = 'http://localhost:3000';
const SECRET = 'ffcf330f1bb1f9325e1de499e20077763f18ba3033e2bfba5cb47853a75890c2';
const results = [];
const check = (n, c, x = '') => results.push(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' | ' + x : ''}`);
async function main() {
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` };
  // perf: 50 event noi tiep tren 10 scratch
  const times = [];
  const firstId = `evt48-perf-first-${Date.now()}`;
  for (let i = 0; i < 50; i++) {
    const code = `SCRATCH48-P${(i % 10) + 1}`;
    const eid = i === 0 ? firstId : `evt48-perf-${i}-${Date.now()}`;
    const t0 = Date.now();
    const r = await fetch(`${API}/api/webhooks/oneoffice/proposal-status`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ event_id: eid, event: 'APPROVED', proposal_code: code })
    });
    await r.json();
    times.push(Date.now() - t0);
    if (r.status !== 200) { check('perf 200 tat ca', false, `i=${i} http=${r.status}`); break; }
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.min(times.length - 1, Math.floor(times.length * 0.95))];
  const max = times[times.length - 1];
  check('50 event deu 200', times.length === 50, `n=${times.length}`);
  check('p95 < 4000ms', p95 < 4000, `p95=${p95}ms max=${max}ms`);

  // duplicate: goi lai event_id dau tien
  let r = await fetch(`${API}/api/webhooks/oneoffice/proposal-status`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ event_id: firstId, event: 'APPROVED', proposal_code: 'SCRATCH48-P1' })
  });
  let j = await r.json();
  check('trung id -> duplicate', r.status === 200 && j.data && j.data.duplicate === true);

  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@station.com', password: '123456' })
  });
  const token = (await login.json()).data.token;
  console.log(results.join('\n'));
  console.log('TOKEN-OK');
}
main().catch(e => { console.error('SCRIPT ERROR', e.message); process.exit(1); });
