const test = require('node:test');
const assert = require('node:assert/strict');

test('ADMIN workflow controls follow server department permissions', async () => {
  const { canOperateStation } = await import('./src/utils/chargingFulfillment.js');
  const user = { role: 'ADMIN', department: 'Back Office' };
  const station = { permissions: { back_office: true, setup: false, finance: false, request_early: false } };
  assert.equal(canOperateStation(user, station, 'back_office'), true);
  assert.equal(canOperateStation(user, station, 'setup'), false);
  assert.equal(canOperateStation(user, station, 'finance'), false);
  assert.equal(canOperateStation(user, station, 'request_early'), false);
  assert.equal(canOperateStation(user, { permissions: { finance: true } }, 'finance'), false);
  assert.equal(canOperateStation({ role: 'ADMIN', department: 'Phòng Setup và Vận hành' },
    { permissions: { back_office: false, setup: true } }, 'setup'), true);
  assert.equal(canOperateStation(user, { permissions: { back_office: false } }, 'back_office'), false);
  assert.equal(canOperateStation({ role: 'SUPER_ADMIN' }, {}, 'finance'), true);
});
