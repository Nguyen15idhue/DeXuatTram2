const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const service = require('../src/services/chargingStationService');
const access = require('../src/services/chargingStationAccessService');

const user = { id: 1, role: 'SUPER_ADMIN' };
const body = {
  file_ids: [11, 12], contract_effective_date: '2026-11-12',
  contract_expiry_date: '2027-11-12', contract_note: ' Signed contract '
};
test.after(() => pool.end());

test('requires files and valid dates, with expiry strictly after effective date', async () => {
  for (const changes of [
    { file_ids: [] }, { file_ids: null }, { file_ids: [0] },
    { contract_effective_date: '' }, { contract_expiry_date: '' },
    { contract_effective_date: '2026-02-30' }, { contract_expiry_date: 'invalid' },
    { contract_expiry_date: '2026-11-12' }, { contract_expiry_date: '2026-11-11' },
    { contract_note: {} }
  ]) {
    await assert.rejects(service.completeContract(1, { ...body, ...changes }, user), { statusCode: 400 });
  }
});

test('ADMIN cannot complete contracts solely by role', async () => {
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
      if (sql.includes('WHERE id = ? FOR UPDATE')) return [[record]];
      if (sql.includes('SELECT p.status')) return [[{ status: 'ACTIVE' }]];
      return [[]];
    }
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('SELECT cs.id')) return [[record]];
    if (sql.includes('charging_station_contract_files')) return [files];
    return [[]];
  });
  t.mock.method(access, 'buildViewScope', async () => ({ sql: '1=1', params: [] }));
  t.mock.method(require('../src/services/adminProposalService'), 'getProposalWithUser', async () => ({ id: 2 }));
  t.mock.method(require('../src/services/chargingStationShippingService'), 'getSummary', async () => ({}));
  t.mock.method(require('../src/services/chargingStationDeploymentService'), 'getDeployments', async () => []);
  return { calls, connection, files };
};

test('completes with multiple files, dates, trimmed note and audit in the same transaction', async t => {
  const { calls } = setup(t);
  const result = await service.completeContract(1, body, user, { actorId: 1, actorRole: 'SUPER_ADMIN' });
  assert.equal(result.contract_files.length, 2);
  const update = calls.find(([sql]) => sql.includes('SET contract_status'));
  assert.deepEqual(update[1], [11, '2026-11-12', '2027-11-12', 'Signed contract', 1]);
  const insert = calls.find(([sql]) => sql.includes('INSERT INTO charging_station_contract_files'));
  assert.deepEqual(insert[1], [[[1, 11, 0], [1, 12, 1]]]);
  const audit = calls.find(([sql]) => sql.includes('INSERT INTO charging_station_activity_logs'));
  const changes = JSON.parse(audit[1][4]);
  assert.equal(changes.contract_files.new, '11, 12');
  assert.equal(changes.contract_expiry_date.new, '2027-11-12');
  assert.ok(calls.indexOf(audit) < calls.findIndex(([sql]) => sql === 'commit'));
  assert.equal(calls.some(([sql]) => sql === 'rollback'), false);
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

test('rejects completing a contract that is not DOING', async t => {
  const { calls } = setup(t, {}, 'DONE');
  await assert.rejects(service.completeContract(1, body, user), { statusCode: 400 });
  assert.ok(calls.some(([sql]) => sql === 'rollback'));
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
