const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const service = require('../src/services/chargingStationService');
const access = require('../src/services/chargingStationAccessService');

const user = { id: 1, role: 'SUPER_ADMIN' };
const body = {
  file_ids: [11, 12], contract_number: ' HD-01 ', contract_effective_date: '2026-11-12',
  contract_expiry_date: '2027-11-12', contract_note: ' Signed contract '
};
test.after(() => pool.end());

test('requires files and valid dates, with expiry strictly after effective date', async () => {
  for (const changes of [
    { file_ids: [] }, { file_ids: null }, { file_ids: [0] },
    { contract_effective_date: '' }, { contract_expiry_date: '' },
    { contract_effective_date: '2026-02-30' }, { contract_expiry_date: 'invalid' },
    { contract_expiry_date: '2026-11-12' }, { contract_expiry_date: '2026-11-11' },
    { contract_note: {} }, { expected_on_days: -1 }, { expected_on_days: 1.5 },
    { expected_on_days: '90' }, { expected_on_days: Number.MAX_SAFE_INTEGER }
  ]) {
    await assert.rejects(service.completeContract(1, { ...body, ...changes }, user), { statusCode: 400 });
  }
});

test('ADMIN cannot complete contracts solely by role', async t => {
  t.mock.method(pool, 'query', async () => [[{ custom_data: { department: 'Phòng khác' } }]]);
  await assert.rejects(service.completeContract(1, body, { id: 2, role: 'ADMIN' }), { statusCode: 403 });
});

const setup = (t, fileOverrides = {}, status = 'DOING') => {
  const calls = [];
  const record = { id: 1, proposal_id: 2, contract_status: status, status: 'ONBOARDING', payment_status: 'NOT' };
  const files = [11, 12].map(id => ({ id, uploaded_by: 1, mime_type: 'application/pdf', ...fileOverrides }));
  const connection = {
    beginTransaction: async () => calls.push(['begin']),
    commit: async () => calls.push(['commit']),
    rollback: async () => calls.push(['rollback']),
    release: () => calls.push(['release']),
    query: async (sql, params) => {
      calls.push([sql, params]);
      if (sql.includes('FROM files')) return [files];
      if (sql.includes('DATE_FORMAT(ngay_du_kien_on')) return [[{ ngay_du_kien_on: '2027-01-01' }]];
      if (sql.includes('WHERE id = ? FOR UPDATE')) return [[record]];
      if (sql.includes('SELECT p.status')) return [[{ status: 'ACTIVE' }]];
      return [[]];
    }
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('proposal_lifecycle_configs')) return [[{ value: '1' }]];
    if (sql.includes('SELECT custom_data FROM users')) return [[{ custom_data: { department: 'Back Office' } }]];
    if (sql.includes('SELECT cs.id')) return [[record]];
    if (sql.includes('charging_station_contract_files')) return [files];
    return [[]];
  });
  t.mock.method(access, 'buildViewScope', async () => ({ sql: '1=1', params: [] }));
  t.mock.method(require('../src/services/adminProposalService'), 'getProposalWithUser', async () => ({ id: 2 }));
  t.mock.method(require('../src/services/chargingStationShippingService'), 'getSummary', async () => ({}));
  t.mock.method(require('../src/services/chargingStationDeploymentService'), 'getDeployments', async () => []);
  t.mock.method(require('../src/services/chargingStationOverrideService'), 'getEditToken', async () => 'test-token');
  return { calls, connection, files };
};

test('Back Office ADMIN can start signing a contract', async t => {
  const { calls } = setup(t, {}, 'NOT');
  await service.startContractSigning(1, { id: 2, role: 'ADMIN' }, {}, { contract_status: 'DOING' });
  assert.ok(calls.some(([sql]) => sql === 'commit'));
});

test('saves notes without advancing an unsigned contract', async t => {
  const { calls } = setup(t, {}, 'NOT');
  await service.startContractSigning(1, user, { actorId: 1, actorRole: 'SUPER_ADMIN' }, {
    contract_status: 'NOT', expected_status: 'NOT', contract_note: ' Preparing '
  });
  const update = calls.find(([sql]) => sql.includes('SET contract_status'));
  assert.deepEqual(update[1], ['NOT', 'Preparing', 1]);
});

test('saves signing status and note together', async t => {
  const { calls } = setup(t, {}, 'NOT');
  await service.startContractSigning(1, user, { actorId: 1, actorRole: 'SUPER_ADMIN' }, {
    contract_status: 'DOING', expected_status: 'NOT', contract_note: ' Sent for signing '
  });
  assert.deepEqual(calls.find(([sql]) => sql.includes('SET contract_status'))[1], ['DOING', 'Sent for signing', 1]);
});

test('Back Office can move signing backwards while retaining notes; stale status rejects writes', async t => {
  const { calls } = setup(t);
  await service.startContractSigning(1, { id: 2, role: 'ADMIN' }, {}, {
    contract_status: 'NOT', expected_status: 'DOING', contract_note: 'Do not replace history'
  });
  assert.deepEqual(calls.find(([sql]) => sql.includes('SET contract_status'))[1], ['NOT', null, 1]);
  calls.length = 0;
  await assert.rejects(service.startContractSigning(1, user, {}, {
    contract_status: 'DOING', expected_status: 'NOT'
  }), { statusCode: 409 });
  assert.equal(calls.some(([sql]) => sql.includes('SET contract_status')), false);
});

test('completes with multiple files, dates, trimmed note and audit in the same transaction', async t => {
  const { calls } = setup(t);
  const result = await service.completeContract(1, body, user, { actorId: 1, actorRole: 'SUPER_ADMIN' });
  assert.equal(result.contract_files.length, 2);
  const update = calls.find(([sql]) => sql.includes('SET contract_status'));
  assert.deepEqual(update[1], [11, 'HD-01', '2026-11-12', '2027-11-12', 'Signed contract', 1]);
  const insert = calls.find(([sql]) => sql.includes('INSERT INTO charging_station_contract_files'));
  assert.deepEqual(insert[1], [[[1, 11, 0], [1, 12, 1]]]);
  const audit = calls.find(([sql]) => sql.includes('INSERT INTO charging_station_activity_logs'));
  const changes = JSON.parse(audit[1][4]);
  assert.equal(changes.contract_files.new, '11, 12');
  assert.equal(changes.contract_number.new, 'HD-01');
  assert.equal(changes.contract_expiry_date.new, '2027-11-12');
  assert.ok(calls.indexOf(audit) < calls.findIndex(([sql]) => sql === 'commit'));
  assert.equal(calls.some(([sql]) => sql === 'rollback'), false);
});

test('requires a valid contract number, including when saving a legacy signed contract', async t => {
  const { calls, connection } = setup(t, {}, 'DONE');
  for (const number of ['', '   ', null, {}, 'x'.repeat(256), undefined]) {
    calls.length = 0;
    await assert.rejects(service.completeContract(1, { ...body, contract_number: number }, user), { statusCode: 400 });
    assert.ok(calls.some(([sql]) => sql === 'rollback'));
    assert.equal(calls.some(([sql]) => sql.includes('SET contract_status')), false);
  }
  const query = connection.query;
  connection.query = async (sql, params) => {
    if (sql.includes('WHERE id = ? FOR UPDATE')) {
      return [[{ id: 1, proposal_id: 2, status: 'ONBOARDING', contract_status: 'DONE',
        contract_number: 'OLD-01', payment_status: 'NOT' }]];
    }
    return query(sql, params);
  };
  await service.completeContract(1, { ...body, contract_number: undefined }, user);
  assert.equal(calls.find(([sql]) => sql.includes('SET contract_status'))[1][1], 'OLD-01');
});

test('ON list resolves proposal people in one batch without changing pagination or owner', async t => {
  const { calls } = setup(t);
  const rows = [
    { id: 1, proposal_user_id: 1, proposer_value: '2', responsible_value: '3', director_value: '4',
      latitude: 0, longitude: 106.25, status: 'ONBOARDING', contract_status: 'NOT' },
    { id: 2, proposal_user_id: 1, proposer_value: null, responsible_value: 'Tên cũ', director_value: null,
      status: 'ONBOARDING', contract_status: 'NOT' }
  ];
  t.mock.method(pool, 'query', async (sql, params) => {
    calls.push([sql, params]);
    if (sql.includes('COUNT(*) AS total')) return [[{ total: 2 }]];
    if (sql.includes('AS proposer_value')) return [rows];
    if (sql.includes('FROM users WHERE id IN')) return [[
      { id: 1, full_name: 'Creator', department: 'Sales' },
      { id: 2, full_name: 'Proposer' }, { id: 3, full_name: 'Assignee' }, { id: 4, full_name: 'Director' }
    ]];
    return [[]];
  });
  t.mock.method(require('../src/services/chargingStationWorkService'), 'getFilter', async () => ({ sql: '1=1', params: [] }));
  t.mock.method(require('../src/services/proposalReportService'), 'resolveScope', async () => ({ role: 'SUPER_ADMIN' }));
  t.mock.method(access, 'permissions', async () => ({}));
  t.mock.method(access, 'recordPermissions', async () => ({}));
  t.mock.method(require('../src/services/proposalAccessService'), 'buildOwnerMatcher', async () => () => false);
  t.mock.method(require('../src/services/chargingStationShippingService'), 'getSummary', async () => ({ items: [] }));
  const result = await service.listChargingStations({ stage: 'thong-tin-chung', tab: 'all', page: 1, limit: 20, user });
  assert.equal(result.pagination.total, 2);
  assert.deepEqual(result.items[0].nguoi_de_xuat, { id: 2, label: 'Proposer' });
  assert.deepEqual(result.items[0].nguoi_phu_trach, { id: 3, label: 'Assignee' });
  assert.deepEqual(result.items[0].nguoi_giao_phu_trach, { id: 4, label: 'Director' });
  assert.equal(result.items[0].user_id, 1);
  assert.equal(result.items[0].owner_department, 'Sales');
  assert.equal(result.items[0].latitude, 0);
  assert.equal(result.items[1].nguoi_de_xuat, null);
  assert.equal(result.items[1].nguoi_phu_trach, 'Tên cũ');
  assert.equal(calls.filter(([sql]) => sql.includes('FROM users WHERE id IN')).length, 1);
});

test('stores expected ON date from effective date and days in the contract transaction', async t => {
  const { calls } = setup(t);
  await service.completeContract(1, {
    ...body, contract_effective_date: '2024-02-28', contract_expiry_date: '2025-02-28', expected_on_days: 2
  }, user, { actorId: 1, actorRole: 'SUPER_ADMIN' });
  const update = calls.find(([sql]) => sql.startsWith('UPDATE station_proposals SET ngay_du_kien_on'));
  assert.deepEqual(update[1], ['2024-03-01', 2]);
  assert.deepEqual(calls.find(([sql]) => sql.startsWith('UPDATE charging_stations SET expected_on_days'))[1], [2, 1]);
  const audit = calls.find(([sql]) => sql.includes('INSERT INTO charging_station_activity_logs'));
  assert.deepEqual(JSON.parse(audit[1][4]).ngay_du_kien_on, {
    label: 'Ngày dự kiến ON', old: '2027-01-01', new: '2024-03-01'
  });
  assert.ok(calls.indexOf(update) < calls.findIndex(([sql]) => sql === 'commit'));
});

for (const [label, overrides, statusCode] of [
  ['another uploader', { uploaded_by: 9 }, 403],
  ['unsupported format', { mime_type: 'text/plain' }, 400]
]) {
  test(`rejects ${label} and rolls back without attaching any files`, async t => {
    const { calls } = setup(t, overrides);
    await assert.rejects(service.completeContract(1, body, user), { statusCode });
    assert.ok(calls.some(([sql]) => sql === 'rollback'));
    assert.equal(calls.some(([sql]) => sql.includes('INSERT INTO charging_station_contract_files')), false);
    assert.equal(calls.some(([sql]) => sql === 'commit'), false);
  });
}

test('setup can revoke an existing confirmation and stale or exempt changes are rejected', async t => {
  const { calls, connection } = setup(t);
  const query = connection.query;
  const current = {
    id: 1, proposal_id: 2, status: 'DELIVERING', contract_status: 'DONE',
    mo_hinh_dau_tu: 'LK', infra_delivery_legacy_exempt: 0,
    infra_delivery_confirmation: 'CONFIRMED', infra_delivery_confirmation_note: 'Đã kiểm tra',
    infra_power_status: 'DONE', infra_site_status: 'DONE', early_delivery_requested: 0
  };
  connection.query = async (sql, params) => {
    if (sql.includes('SELECT cs.*') && sql.includes('early_delivery_requested')) {
      calls.push([sql, params]);
      return [[{ ...current }]];
    }
    return query(sql, params);
  };
  t.mock.method(access, 'assertSetup', async () => {});
  await service.updateInfrastructureConfirmation(1, {
    status: 'NOT_CONFIRMED', expected_status: 'CONFIRMED', note: 'Kiểm tra lại'
  }, user, { actorId: 1 });
  const update = calls.find(([sql]) => sql.includes('SET infra_delivery_confirmation = ?'));
  assert.deepEqual(update[1], ['NOT_CONFIRMED', 'Kiểm tra lại', null, null, 1]);
  assert.ok(calls.some(([sql]) => sql === 'commit'));
  calls.length = 0;
  await assert.rejects(service.updateInfrastructureConfirmation(1, {
    status: 'NOT_CONFIRMED', expected_status: 'NOT_CONFIRMED'
  }, user), { statusCode: 409 });
  current.mo_hinh_dau_tu = 'NQ';
  await assert.rejects(service.updateInfrastructureConfirmation(1, {
    status: 'NOT_CONFIRMED', expected_status: 'CONFIRMED'
  }, user), { statusCode: 409 });
  assert.equal(calls.some(([sql]) => sql.includes('SET infra_delivery_confirmation = ?')), false);
});

test('setup confirmation requires both infrastructure items or an early request', async t => {
  const { calls, connection } = setup(t);
  const query = connection.query;
  const current = {
    id: 1, proposal_id: 2, status: 'ONBOARDING', contract_status: 'DONE',
    mo_hinh_dau_tu: 'LK', infra_delivery_legacy_exempt: 0,
    infra_delivery_confirmation: 'NOT_CONFIRMED',
    infra_power_status: 'DONE', infra_site_status: 'NOT', early_delivery_requested: 0
  };
  connection.query = async (sql, params) => {
    if (sql.includes('SELECT cs.*') && sql.includes('early_delivery_requested')) {
      calls.push([sql, params]);
      return [[{ ...current }]];
    }
    return query(sql, params);
  };
  t.mock.method(access, 'assertSetup', async () => {});
  const request = { status: 'CONFIRMED', expected_status: 'NOT_CONFIRMED', note: '' };
  await assert.rejects(service.updateInfrastructureConfirmation(1, request, user), { statusCode: 409 });
  assert.equal(calls.some(([sql]) => sql.includes('SET infra_delivery_confirmation = ?')), false);
  calls.length = 0;
  current.early_delivery_requested = 1;
  await service.updateInfrastructureConfirmation(1, request, user);
  assert.deepEqual(calls.find(([sql]) => sql.includes('SET infra_delivery_confirmation = ?'))[1],
    ['CONFIRMED', null, 1, 'LK', 1]);
  assert.ok(calls.some(([sql]) => sql === 'commit'));
});

test('can confirm DONE again with files already attached by another uploader', async t => {
  const { calls, connection } = setup(t, { uploaded_by: 9 }, 'DONE');
  const query = connection.query;
  connection.query = async (sql, params) => sql.includes('SELECT file_id FROM charging_station_contract_files')
    ? [[{ file_id: 11 }, { file_id: 12 }]] : query(sql, params);
  await service.completeContract(1, { ...body, expected_status: 'DONE' }, user);
  assert.ok(calls.some(([sql]) => sql === 'commit'));
});

test('rejects stale completion without modifying attached files', async t => {
  const { calls } = setup(t, {}, 'DONE');
  await assert.rejects(service.completeContract(1, { ...body, expected_status: 'DOING' }, user), { statusCode: 409 });
  assert.ok(calls.some(([sql]) => sql === 'rollback'));
  assert.equal(calls.some(([sql]) => sql.includes('DELETE FROM charging_station_contract_files')), false);
});

test('rejects an absent attachment before completing the contract', async t => {
  const { calls, files } = setup(t);
  files.pop();
  await assert.rejects(service.completeContract(1, body, user), { statusCode: 400 });
  assert.ok(calls.some(([sql]) => sql === 'rollback'));
  assert.equal(calls.some(([sql]) => sql.includes('SET contract_status')), false);
});

test('attachment storage failure rolls back the contract change', async t => {
  const { calls, connection } = setup(t);
  const query = connection.query;
  connection.query = async (sql, params) => {
    if (sql.includes('INSERT INTO charging_station_contract_files')) throw new Error('Storage failure');
    return query(sql, params);
  };
  await assert.rejects(service.completeContract(1, body, user), /Storage failure/);
  assert.ok(calls.some(([sql]) => sql === 'rollback'));
  assert.equal(calls.some(([sql]) => sql === 'commit'), false);
});

test('migration preserves old files and can be applied twice', {
  skip: process.env.RUN_CONTRACT_MIGRATION_TEST !== '1'
}, async () => {
  const connection = await pool.getConnection();
  const database = `test_contract_${Date.now()}`;
  const [[original]] = await connection.query('SELECT DATABASE() AS name');
  try {
    await connection.query(`CREATE DATABASE \`${database}\``);
    await connection.query(`USE \`${database}\``);
    await connection.query('CREATE TABLE files (id INT PRIMARY KEY) ENGINE=InnoDB');
    await connection.query('CREATE TABLE charging_stations (id INT PRIMARY KEY, contract_file_id INT) ENGINE=InnoDB');
    await connection.query('INSERT INTO files VALUES (11)');
    await connection.query('INSERT INTO charging_stations VALUES (1,11)');
    for (const filename of ['231-charging-station-contract-details.sql', '232-charging-station-infrastructure-details.sql']) {
      const sql = require('fs').readFileSync(require('path').join(__dirname, '../../database', filename), 'utf8');
      for (let run = 0; run < 2; run++) {
        for (const statement of sql.split(';').filter(part => part.trim())) await connection.query(statement);
      }
    }
    const [[row]] = await connection.query('SELECT * FROM charging_station_contract_files');
    assert.equal(row.file_id, 11);
    const [[count]] = await connection.query('SELECT COUNT(*) AS n FROM charging_station_contract_files');
    assert.equal(count.n, 1);
    const [[station]] = await connection.query('SELECT * FROM charging_stations');
    assert.equal(station.contract_effective_date, null);
    assert.equal(station.contract_expiry_date, null);
    assert.equal(station.infra_power_date, null);
    assert.equal(station.infra_site_date, null);
    assert.equal(station.infra_power_note, null);
    assert.equal(station.infra_site_note, null);
  } finally {
    await connection.query(`USE \`${original.name}\``);
    await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    connection.release();
  }
});
