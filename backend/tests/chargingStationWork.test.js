const test = require('node:test');
const assert = require('node:assert/strict');
const access = require('../src/services/chargingStationAccessService');
const work = require('../src/services/chargingStationWorkService');
const pool = require('../src/utils/db');

test.after(async () => pool.end());

test('ADMIN is read-only even when department names an operating team', async () => {
  for (const department of ['Back Office', 'Phòng Setup và Vận hành', 'Phòng Tài chính']) {
    const user = { id: 1, role: 'ADMIN', custom_data: { department } };
    assert.deepEqual(await access.permissions(user), {
      back_office: false, setup: false, finance: false, request_early: false
    });
    const { expressions } = await work.actionable(user);
    for (const key of ['contract', 'infrastructure', 'installation', 'acceptance', 'on_station', 'finance']) {
      assert.equal(expressions[key], '0');
    }
    await assert.rejects(() => access.assertBackOffice(user), { statusCode: 403 });
    await access.assertFinanceViewer(user);
  }
});

test('SUPER_ADMIN can perform each department step', async () => {
  assert.deepEqual(await access.permissions({ id: 1, role: 'SUPER_ADMIN' }), {
    back_office: true, setup: true, finance: true, request_early: true
  });
});

test('receipt, installation, acceptance and operation filter separate progress', () => {
  assert.match(work.stageFilters['giao-tru'].completed, /received_quantity/);
  assert.match(work.stageFilters['lap-tru'].need, /stage='INSTALLING'/);
  assert.match(work.stageFilters['nghiem-thu'].need, /stage='ACCEPTANCE'/);
  assert.match(work.stageFilters['on-tram'].need, /stage='CONFIGURING'/);
  assert.match(work.stageFilters['xay-dung-ha-tang'].need, /infra_power_status/);
});

test('overview completion depends on all poles operating, not financial or contract paperwork', async () => {
  const completed = (await work.getFilter('thong-tin-chung', 'completed')).sql;
  assert.match(completed, /charging_station_commitments/);
  assert.match(completed, /stage='OPERATING'/);
  assert.doesNotMatch(completed, /contract_status|infra_site_status|REFUND_PENDING|payment_status/);
  const pending = await work.getFilter('thong-tin-chung', 'need');
  assert.match(pending.sql, /NOT /);
  assert.match(pending.sql, /CANCELLED/);
  assert.deepEqual(pending.params, []);
});

test('unknown stages fail explicitly rather than returning a broader list', async () => {
  await assert.rejects(() => work.getFilter('unexpected', 'all'), { statusCode: 400 });
});
