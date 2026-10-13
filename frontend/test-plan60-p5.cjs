const API = 'http://localhost:3000';
async function main() {
  const results = [];
  const check = (name, ok, info = '') => {
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${info ? ' — ' + info : ''}`);
  };
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@station.com', password: '123456' }),
  }).then((r) => r.json());
  const token = login.data?.token;
  check('login', !!token);
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const cfg = await fetch(`${API}/api/admin/lifecycle-config`, { headers: H }).then((r) => r.json());
  check('GET config kem extend limits', cfg.success && cfg.data.maxTimes === 3 && cfg.data.maxDaysPerTime === 30, JSON.stringify({ maxTimes: cfg.data?.maxTimes, maxDaysPerTime: cfg.data?.maxDaysPerTime }));

  const bad = await fetch(`${API}/api/admin/lifecycle-config`, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ rules: cfg.data.rules, warn_hours: cfg.data.warn_hours, extend_max_times: -1, extend_max_days_per_time: 30 }),
  }).then((r) => r.json());
  check('PUT so am bi 400', bad.success === false, bad.message);

  const ok = await fetch(`${API}/api/admin/lifecycle-config`, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ rules: cfg.data.rules, warn_hours: cfg.data.warn_hours, extend_max_times: 2, extend_max_days_per_time: 5 }),
  }).then((r) => r.json());
  check('PUT 2 lan/5 ngay', ok.success && ok.data.maxTimes === 2 && ok.data.maxDaysPerTime === 5, JSON.stringify(ok.data));

  const list = await fetch(`${API}/api/admin/proposals?limit=1`, { headers: H }).then((r) => r.json());
  const pid = Array.isArray(list.data) ? list.data[0]?.id : list.data?.proposals?.[0]?.id;
  check('co de xuat test', !!pid, `id=${pid}`);
  if (pid) {
    const info = await fetch(`${API}/api/admin/proposals/${pid}/extend-info`, { headers: H }).then((r) => r.json());
    check('GET extend-info', info.success && info.data.maxTimes === 2 && info.data.maxDaysPerTime === 5, JSON.stringify(info.data));
    const over = await fetch(`${API}/api/admin/proposals/${pid}/extend-deadline`, {
      method: 'POST', headers: H, body: JSON.stringify({ days: 6, hours: 0, reason: 'test vuot ngay' }),
    }).then((r) => r.json());
    check('gia han 6 ngay bi chan', over.success === false, over.message);
  }

  await fetch(`${API}/api/admin/lifecycle-config`, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ rules: cfg.data.rules, warn_hours: cfg.data.warn_hours, extend_max_times: 3, extend_max_days_per_time: 30 }),
  });
  console.log('da tra config ve 3 lan/30 ngay');
  const failed = results.filter((r) => !r).length;
  console.log(`\nTOTAL: ${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
}
main();
