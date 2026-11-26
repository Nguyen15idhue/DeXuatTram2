const service = require('./src/services/chargingStation/chargingStationService');
(async () => {
  const user = { id: 1, role: 'SUPER_ADMIN', email: 'admin@station.com' };
  const scope = await service.buildProposalScope(user);
  console.log(JSON.stringify(scope));
  const isAdmin = (await require('./src/services/proposal/proposalReportService').resolveScope(user)).isAdmin;
  console.log('isAdmin=', isAdmin);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
