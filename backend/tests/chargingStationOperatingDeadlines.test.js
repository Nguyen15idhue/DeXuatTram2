const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const readiness = require('../src/services/chargingStationReadiness');
const stations = require('../src/services/chargingStationService');
const access = require('../src/services/proposalAccessService');

const station = {
  id: 1, proposal_id: 11, proposal_user_id: 7, status: 'OPERATING', sub_status: 'ACTIVE',
  mo_hinh_dau_tu: 'LK', contract_status: 'NOT', infra_power_status: 'NOT',
  infra_site_status: 'NOT', payment_status: 'NOT', deposit_status: 'NOT_RECEIVED',
  contract_deadline_at: '2020-01-01', infra_deadline_at: '2020-01-01', finance_deadline_at: '2020-01-01',
};

test('operating stations have no effective deadline regardless of incomplete paperwork, model or old dates', () => {
  for (const model of ['TDT', 'LK', 'NQ', 'NQ_LK']) {
    for (const deadline of ['2020-01-01', '2099-01-01', null]) {
      assert.equal(readiness.isDeadlineActive({ ...station, mo_hinh_dau_tu: model, contract_deadline_at: deadline }), false);
    }
  }
  assert.equal(readiness.isDeadlineActive({ ...station, status: 'ONBOARDING' }), true);
  assert.match(readiness.deadlineActiveSql('cs', 'p'), /cs\.status = 'ONBOARDING'/);
});

test('direct API extension is rejected for operating stations without changing retained historical dates', async (t) => {
  let rolledBack = false;
  t.mock.method(access, 'canActAsProposalOwner', async () => true);
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => {},
    query: async sql => {
      assert.match(sql, /SELECT cs\.\*/);
      return [[{ ...station }]];
    },
    rollback: async () => { rolledBack = true; },
    release() {}
  }));
  await assert.rejects(stations.extendOnboardingDeadline(1, { reason: 'Test' }, { id: 7, role: 'SUPER_ADMIN' }),
    error => error.statusCode === 400 && error.message.includes('không còn áp dụng deadline hợp đồng, hạ tầng và tài chính'));
  assert.equal(rolledBack, true);
  assert.equal(station.contract_deadline_at, '2020-01-01');
});

test('overdue worker filters operating stations and rechecks status before cancellation', async (t) => {
  let rolledBack = false;
  let transactions = 0;
  t.mock.method(pool, 'query', async sql => {
    assert.match(sql, /cs\.status = 'ONBOARDING'/);
    return [[station]];
  });
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => { transactions++; },
    query: async sql => {
      assert.match(sql, /UPDATE charging_stations/);
      assert.match(sql, /cs\.status = 'ONBOARDING'/);
      return [{ affectedRows: 0 }];
    },
    rollback: async () => { rolledBack = true; },
    release() {}
  }));
  assert.equal(await stations.cancelOverdueStations(), 0);
  assert.equal(transactions, 1);
  assert.equal(rolledBack, true);
});

test.after(async () => { await pool.end(); });
