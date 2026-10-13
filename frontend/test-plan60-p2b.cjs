const API = 'http://localhost:3000';
async function main() {
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@station.com', password: '123456' }),
  }).then((r) => r.json());
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.data.token}` };
  const list = await fetch(`${API}/api/field-definitions?entity=station_proposals`, { headers: H }).then((r) => r.json());
  const rows = Array.isArray(list.data) ? list.data : [];
  const existed = rows.find((f) => f.key === 'link_google_map');
  console.log('da co field:', existed ? `id=${existed.id} status=${existed.status}` : 'chua');
  if (!existed) {
    const created = await fetch(`${API}/api/field-definitions`, {
      method: 'POST', headers: H,
      body: JSON.stringify({
        entity: 'station_proposals',
        key: 'link_google_map',
        label: 'Link Google Map',
        type: 'formula',
        source_type: 'json',
        required: 0,
        status: 'active',
        formula_config: {
          compute_mode: 'pre',
          expression: "CONCAT('https://www.google.com/maps?q=', latitude, ',', longitude)",
          outputType: 'url',
          referencedFields: ['latitude', 'longitude'],
        },
      }),
    }).then((r) => r.json());
    console.log('tao field:', JSON.stringify(created).slice(0, 300));
    if (!created.success) process.exit(1);
  }
  console.log('XONG: field link_google_map san sang, ban tu gan vao form');
}
main();
