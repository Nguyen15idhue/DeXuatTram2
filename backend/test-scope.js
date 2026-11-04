const s = require('./src/services/proposalReportService');
(async () => {
  const u = { id: 1, role: 'SUPER_ADMIN' };
  const sc = await s.resolveScope(u);
  console.log(JSON.stringify(sc));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
