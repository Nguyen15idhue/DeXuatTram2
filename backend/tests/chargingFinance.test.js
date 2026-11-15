const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const stations = require('../src/services/chargingStationService');
const deployments = require('../src/services/chargingStationDeploymentService');
const finance = require('../src/services/chargingFinanceService');
const user = { id: 1, role: 'SUPER_ADMIN' };
const body = { invoice_type: 'DEPOSIT', amount: 100, evidence_file_id: 11, deposit_refund_required: true };
test.after(() => pool.end());

const setup = (t, overrides = {}, totals = {}) => {
  const station = { id: 1, proposal_id: 2, status: 'OPERATING', sub_status: 'ACTIVE',
    mo_hinh_dau_tu: 'LK', deposit_status: 'RECEIVED', payment_status: 'DOING',
    tong_gia_tri_chot: 1000, deposit_refund_required: 1, fulfillment_review_required: 0, ...overrides };
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push(['begin']),
    commit: async () => calls.push(['commit']),
    rollback: async () => calls.push(['rollback']),
    release: () => {},
    query: async (sql, params) => {
      calls.push([sql, params]);
      if (sql.includes('WHERE cs.id = ? FOR UPDATE')) return [[station]];
      if (sql.includes('AS deposit_total')) return [[{ deposit_total: 200, payment_total: 0, refund_total: 0, ...totals }]];
      if (sql.includes('FROM files')) return [[{ id: 11, uploaded_by: 1, mime_type: 'application/pdf' }]];
      if (sql.includes('FROM charging_station_commitments')) return [[{ quantity: 2, operating: 2 }]];
      if (sql.includes('INSERT INTO charging_station_invoices')) return [{ insertId: 77 }];
      return [[]];
    }
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  t.mock.method(pool, 'query', async () => [[{ id: 77 }]]);
  t.mock.method(stations, 'assertFinanceManager', async () => {});
  t.mock.method(stations, 'canViewChargingStation', async () => true);
  t.mock.method(stations, 'writeActivity', async (_connection, event) => calls.push(['audit', event]));
  t.mock.method(stations, 'advanceToDeliveryIfReady', async () => {});
  t.mock.method(stations, 'advanceProposalToDeploying', async () => {});
  t.mock.method(deployments, 'refreshStationProgress', async () => {});
  return { calls, connection, station };
};

test('all invoice types require evidence before opening a transaction', async t => {
  const { calls } = setup(t);
  for (const invoice_type of ['DEPOSIT', 'PAYMENT', 'REFUND']) {
    await assert.rejects(finance.createInvoice(1, { invoice_type, amount: 100 }, user), { statusCode: 400 });
  }
  assert.equal(calls.length, 0);
});

test('PAYMENT and REFUND require an actual deposit invoice, not a RECEIVED status', async t => {
  const { calls } = setup(t, {}, { deposit_total: 0 });
  for (const invoice_type of ['PAYMENT', 'REFUND']) {
    await assert.rejects(finance.createInvoice(1, { invoice_type, amount: 100, evidence_file_id: 11 }, user),
      { statusCode: 409 });
  }
  assert.equal(calls.some(([sql]) => sql.includes('INSERT INTO charging_station_invoices')), false);
});

test('deposit saves the refund flag with the invoice and audit before commit', async t => {
  const { calls } = setup(t, { deposit_refund_required: null });
  await finance.createInvoice(1, body, user);
  const update = calls.find(([sql]) => sql.startsWith('UPDATE charging_stations'));
  assert.deepEqual(update[1], ['RECEIVED', 'DOING', true, 1]);
  const audit = calls.find(([sql]) => sql === 'audit')[1];
  assert.equal(audit.changedFields.deposit_refund_required.new, true);
  assert.ok(calls.findIndex(([sql]) => sql === 'audit') < calls.findIndex(([sql]) => sql === 'commit'));
});

test('refund requires opt-in, LK, full ON and cannot exceed received deposits', async t => {
  const { station, connection, calls } = setup(t);
  const request = { invoice_type: 'REFUND', amount: 100, evidence_file_id: 11 };
  for (const patch of [
    { deposit_refund_required: null }, { mo_hinh_dau_tu: 'NQ' }, { sub_status: 'NOT_CONFIGURED' },
    { fulfillment_review_required: 1 }
  ]) {
    const before = { ...station };
    Object.assign(station, patch);
    await assert.rejects(finance.createInvoice(1, request, user));
    Object.assign(station, before);
  }
  await assert.rejects(finance.createInvoice(1, { ...request, amount: 201 }, user), { statusCode: 400 });
  const query = connection.query;
  connection.query = async (sql, params) => sql.includes('FROM charging_station_commitments')
    ? [[{ quantity: 2, operating: 1 }]] : query(sql, params);
  await assert.rejects(finance.createInvoice(1, request, user), { statusCode: 409 });
  assert.equal(calls.some(([sql]) => sql.includes('INSERT INTO charging_station_invoices')), false);
});

test('refund reduces net payment and marks deposit refunded only when fully returned', async t => {
  const { calls } = setup(t, { payment_status: 'DONE' }, { payment_total: 800 });
  await finance.createInvoice(1, { invoice_type: 'REFUND', amount: 200, evidence_file_id: 11 }, user);
  assert.deepEqual(calls.find(([sql]) => sql.startsWith('UPDATE charging_stations'))[1], ['REFUNDED', 'DOING', true, 1]);
});

test('cannot change refund flag or add deposit after a refund', async t => {
  const { calls } = setup(t, { deposit_status: 'REFUND_PENDING' }, { refund_total: 50 });
  await assert.rejects(finance.createInvoice(1, { ...body, deposit_refund_required: false }, user), { statusCode: 409 });
  assert.equal(calls.some(([sql]) => sql.includes('INSERT INTO charging_station_invoices')), false);
});

test('flag cannot be injected on PAYMENT and evidence ownership is enforced', async t => {
  const { connection, calls } = setup(t);
  await assert.rejects(finance.createInvoice(1, { ...body, invoice_type: 'PAYMENT' }, user), { statusCode: 400 });
  const query = connection.query;
  connection.query = async (sql, params) => sql.includes('FROM files')
    ? [[{ id: 11, uploaded_by: 9, mime_type: 'application/pdf' }]] : query(sql, params);
  await assert.rejects(finance.createInvoice(1, body, user), { statusCode: 403 });
  assert.equal(calls.some(([sql]) => sql.includes('INSERT INTO charging_station_invoices')), false);
});
