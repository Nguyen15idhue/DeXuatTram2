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
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.data.token}` };
  const expr = "CONCAT('https://www.google.com/maps?q=', latitude, ',', longitude)";
  const r1 = await fetch(`${API}/api/formulas/preview`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ expression: expr, scope: { latitude: 10.7626, longitude: 106.6601 } }),
  }).then((r) => r.json());
  console.log(JSON.stringify(r1).slice(0, 300));
  const val = r1.data?.result ?? r1.data?.value ?? r1.data;
  check('CONCAT ra link google map', val === 'https://www.google.com/maps?q=10.7626,106.6601', String(val));
  const r2 = await fetch(`${API}/api/formulas/validate`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ expression: expr, fields: [{ key: 'latitude', label: 'Vĩ độ' }, { key: 'longitude', label: 'Kinh độ' }] }),
  }).then((r) => r.json());
  check('validate bieu thuc', r2.success === true, JSON.stringify(r2).slice(0, 160));
  const failed = results.filter((x) => !x).length;
  console.log(`\nTOTAL: ${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
}
main();
