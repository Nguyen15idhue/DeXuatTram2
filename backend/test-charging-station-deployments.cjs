const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

let state;
let queue = Promise.resolve();
const setup = { id: 8, role: 'SALES' };
const reset = () => {
  state = {
    station: { id: 1, proposal_id: 2, ma_tram: 'TEST', status: 'INSTALLING', sub_status: 'NOT_INSTALLED',
      contract_status: 'DONE', infra_power_status: 'DONE', infra_site_status: 'DONE',
      deposit_status: 'RECEIVED', payment_status: 'DOING', cms_station_code: null, on_date: null },
    proposal: { status: 'APPROVED', model: 'LK' },
    portions: [1, 2].map((id) => ({ id, charging_station_id: 1, export_item_id: id, quantity: 1,
      stage: 'INSTALLING', sub_status: 'NOT_INSTALLED', on_date: null })),
    commitments: [{ id: 1, quantity: 2 }],
    events: [], logs: [], notifications: [], transitions: [], failTransition: false,
    file: { id: 10, uploaded_by: 8, mime_type: 'application/pdf', status: 'active' }
  };
};
const query = async (sql, args = []) => {
  if (sql.startsWith('SELECT * FROM charging_stations')) return [[{ ...state.station }]];
  if (sql.includes('FROM charging_station_fulfillment_events')) {
    return [state.events.filter((e) => e.request_id === args[1])];
  }
  if (sql.startsWith('SELECT * FROM charging_station_deployments')) {
    return [state.portions.filter((p) => p.id === args[0] && p.charging_station_id === args[1]).map((p) => ({ ...p }))];
  }
  if (sql.includes('FROM charging_station_deployments d')) return [state.portions.map((p) => ({ ...p }))];
  if (sql.includes('FROM station_proposals')) return [[{ ...state.proposal }]];
  if (sql.includes('FROM charging_station_commitments')) {
    return [state.commitments.map((c) => ({ ...c,
      operating_quantity: state.portions.filter((p) => p.stage === 'OPERATING' && (p.commitment_id || 1) === c.id)
        .reduce((n, p) => n + p.quantity, 0) }))];
  }
  if (sql.startsWith('SELECT * FROM files')) return [[{ ...state.file }]];
  if (sql.startsWith('SELECT id, role, custom_data FROM users')) return [[{ id: 8, role: 'SUPER_ADMIN', custom_data: '{}' }]];
  if (sql.startsWith('UPDATE charging_station_deployments SET acceptance_file_id')) {
    Object.assign(state.portions.find((p) => p.id === args[1]), { acceptance_file_id: args[0], acceptance_date: '2026-11-10' });
  } else if (sql.startsWith('UPDATE charging_station_deployments SET stage')) {
    Object.assign(state.portions.find((p) => p.id === args[3]), { stage: args[0], sub_status: args[1], on_date: args[2] });
  } else if (sql.startsWith('UPDATE charging_stations SET cms_station_code')) {
    Object.assign(state.station, { cms_station_code: args[0], on_date: args[1] });
  } else if (sql.startsWith('UPDATE charging_stations SET status')) {
    Object.assign(state.station, { status: args[0], sub_status: args[1] });
  } else if (sql.startsWith("UPDATE charging_stations SET deposit_status = 'REFUND_PENDING'")) {
    state.station.deposit_status = 'REFUND_PENDING';
  } else if (sql.includes('INSERT INTO charging_station_activity_logs')) state.logs.push(args);
  else if (sql.includes('INSERT INTO notifications')) state.notifications.push(args);
  else if (sql.includes('INSERT INTO charging_station_fulfillment_events')) {
    assert.ok(!state.events.some((e) => e.request_id === args[1]));
    state.events.push({ request_id: args[1], operation: args[2], payload: JSON.parse(args[4]), result: JSON.parse(args[5]) });
  } else throw new Error(`Unexpected SQL: ${sql}`);
  return [{ affectedRows: 1 }];
};
const pool = {
  query,
  getConnection: async () => {
    let unlock;
    let snapshot;
    return {
      beginTransaction: async () => {},
      query: async (sql, args) => {
        if (sql.startsWith('SELECT * FROM charging_stations') && !unlock) {
          const previous = queue;
          queue = new Promise((resolve) => { unlock = resolve; });
          await previous;
          snapshot = structuredClone(state);
        }
        return query(sql, args);
      },
      commit: async () => { if (unlock) { unlock(); unlock = null; } },
      rollback: async () => { if (snapshot) state = snapshot; if (unlock) { unlock(); unlock = null; } },
      release: () => {}
    };
  }
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent?.filename.endsWith('chargingStationDeploymentService.js')) {
    if (request === '../utils/db') return pool;
    if (request === './chargingStationAccessService') return {
      assertSetup: async (user) => {
        if (user.role === 'ADMIN') throw Object.assign(new Error('Read only'), { statusCode: 403 });
      },
      assertView: async () => {}
    };
    if (request === '../controllers/fileController') return { canAccessFile: async () => true };
    if (request === './proposalLifecycle') return {
      transitionOnStationWithinTransaction: async (connection, proposalId, status) => {
        assert.ok(connection.query);
        state.transitions.push(status);
        state.proposal.status = status;
        if (state.failTransition && status === 'ACTIVE') throw new Error('injected lifecycle failure');
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const service = require('./src/services/chargingStationDeploymentService');
let serial = 0;
const act = (id, action, extra = {}) => service.updatePortion(1, id,
  { action, request_id: `test-${++serial}`, ...extra }, setup);
const ready = (id) => Object.assign(state.portions.find((p) => p.id === id),
  { stage: 'CONFIGURING', sub_status: 'NOT_CONFIGURED', acceptance_file_id: 10 });
const configure = (id, extra = {}) => act(id, 'complete-configuration',
  { cms_station_code: 'CMS-1', on_date: '2026-11-10', ...extra });
const errorStatus = (status) => (error) => error.statusCode === status;

test('parallel deployment workflow without database or external queue writes', async (t) => {
  await t.test('installation, rejection, owned PDF and all activations leave refund manual', async () => {
    reset();
    await assert.rejects(act(1, 'complete-installation'), errorStatus(409));
    await act(1, 'start-installation');
    await act(1, 'complete-installation');
    await assert.rejects(act(1, 'acceptance-failed'), errorStatus(400));
    await act(1, 'acceptance-failed', { reason: 'Chưa đạt' });
    assert.equal(state.portions[0].stage, 'ACCEPTANCE');
    state.file.uploaded_by = 9;
    await assert.rejects(act(1, 'acceptance-passed', { acceptance_file_id: 10 }), errorStatus(403));
    state.file.uploaded_by = 8;
    state.file.mime_type = 'image/png';
    await assert.rejects(act(1, 'acceptance-passed', { acceptance_file_id: 10 }), errorStatus(400));
    state.file.mime_type = 'application/pdf';
    await act(1, 'acceptance-passed', { acceptance_file_id: 10 });
    assert.equal(state.station.status, 'INSTALLING');
    await configure(1);
    assert.deepEqual(state.transitions, ['DEPLOYING', 'ACTIVE']);
    assert.equal(state.station.status, 'OPERATING');
    assert.equal(state.station.deposit_status, 'RECEIVED');
    ready(2);
    await configure(2, { on_date: '2026-11-11' });
    assert.equal(state.station.on_date, '2026-11-10');
    assert.equal(state.portions[1].on_date, '2026-11-11');
    assert.equal(state.station.deposit_status, 'RECEIVED');
    assert.equal(state.notifications.filter((n) => n[1] === 'CHARGING_STATION_REFUND_TASK').length, 0);
  });
  await t.test('missing prerequisites require explicit boolean confirmation and reason', async () => {
    reset(); ready(1); state.station.infra_site_status = 'NOT';
    await assert.rejects(configure(1), errorStatus(400));
    await assert.rejects(configure(1, { accept_missing: 'true', reason: 'Giao sớm' }), errorStatus(400));
    await assert.rejects(configure(1, { accept_missing: true }), errorStatus(400));
    await configure(1, { accept_missing: true, reason: 'Chấp nhận thiếu mặt bằng' });
    assert.equal(state.proposal.status, 'ACTIVE');
  });
  await t.test('invalid calendar dates and CMS conflicts are rejected', async () => {
    reset(); ready(1); ready(2);
    await assert.rejects(configure(1, { on_date: '2026-02-30' }), errorStatus(400));
    await configure(1);
    await assert.rejects(configure(2, { cms_station_code: 'CMS-2' }), errorStatus(409));
    assert.equal(state.portions[1].stage, 'CONFIGURING');
  });
  await t.test('concurrent duplicate requests produce one event, log and notification', async () => {
    reset();
    const body = { action: 'start-installation', request_id: 'race-start' };
    const results = await Promise.all([service.updatePortion(1, 1, body, setup), service.updatePortion(1, 1, body, setup)]);
    assert.deepEqual(results[0], results[1]);
    assert.equal(state.events.length, 1);
    assert.equal(state.logs.filter((log) => log[1] === 'portion_start_installation').length, 1);
    assert.equal(state.notifications.length, 1);
    await assert.rejects(service.updatePortion(1, 2, body, setup), errorStatus(409));
  });
  await t.test('concurrent first ON with different CMS serializes and leaves loser unconfigured', async () => {
    reset(); ready(1); ready(2);
    const results = await Promise.allSettled([configure(1), configure(2, { cms_station_code: 'CMS-2' })]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.find((r) => r.status === 'rejected').reason.statusCode, 409);
    assert.equal(state.portions.filter((p) => p.stage === 'OPERATING').length, 1);
    assert.equal(state.events.length, 1);
  });
  await t.test('lifecycle failure rolls back proposal, portion, logs, event and station', async () => {
    reset(); ready(1); state.failTransition = true;
    const before = structuredClone(state);
    await assert.rejects(configure(1), /injected lifecycle failure/);
    assert.deepEqual(state, before);
  });
  await t.test('idempotent configuration replay does not repeat activation or refund', async () => {
    reset(); ready(1);
    const body = { action: 'complete-configuration', request_id: 'configure-once', cms_station_code: 'CMS-1', on_date: '2026-11-10' };
    const one = await service.updatePortion(1, 1, body, setup);
    const before = structuredClone(state);
    assert.deepEqual(await service.updatePortion(1, 1, body, setup), one);
    assert.deepEqual(state, before);
  });
  await t.test('idempotency handles MySQL JSON key order and rejects changed payload', async () => {
    reset();
    const body = { action: 'start-installation', request_id: 'json-order' };
    const first = await service.updatePortion(1, 1, body, setup);
    state.events[0].payload = Object.fromEntries(Object.entries(state.events[0].payload).reverse());
    assert.deepEqual(await service.updatePortion(1, 1, body, setup), first);
    await assert.rejects(service.updatePortion(1, 1, { ...body, reason: 'Different content' }, setup), errorStatus(409));
    await assert.rejects(service.updatePortion(1, 1, null, setup), errorStatus(400));
  });
  await t.test('ADMIN remains read-only and configured legacy station metadata is preserved', async () => {
    reset();
    await assert.rejects(service.updatePortion(1, 1, { action: 'start-installation', request_id: 'admin' },
      { id: 1, role: 'ADMIN' }), errorStatus(403));
    state.station.status = 'OPERATING'; state.station.sub_status = 'ACTIVE';
    state.station.cms_station_code = 'LEGACY'; state.station.on_date = '2026-01-01';
    await service.refreshStationProgress(pool, 1);
    assert.equal(state.station.status, 'OPERATING');
    assert.equal(state.station.cms_station_code, 'LEGACY');
    assert.equal(state.station.on_date, '2026-01-01');
  });
  await t.test('refund requires every commitment, not aggregate over-delivery', async () => {
    reset(); ready(1); ready(2);
    state.commitments = [{ id: 1, quantity: 1 }, { id: 2, quantity: 1 }];
    await configure(1); await configure(2);
    assert.equal(state.station.deposit_status, 'RECEIVED');
    state.commitments = [];
    await service.refreshStationProgress(pool, 1);
    assert.equal(state.station.deposit_status, 'RECEIVED');
  });
  await t.test('resolving fulfillment review does not automatically request refund', async () => {
    reset(); ready(1); ready(2);
    state.station.fulfillment_review_required = 1;
    await configure(1); await configure(2);
    assert.equal(state.station.deposit_status, 'RECEIVED');
    state.station.fulfillment_review_required = 0;
    await service.refreshStationProgress(pool, 1);
    assert.equal(state.station.deposit_status, 'RECEIVED');
  });
});
