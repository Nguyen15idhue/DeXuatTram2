const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const service = require('../src/services/chargingStationCommitmentService');

const superAdmin = { id: 8, role: 'SUPER_ADMIN' };
test.after(() => pool.end());

const setup = (t, { snapshot = null, commitments = [], evidence = [], custom = {} } = {}) => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM charging_stations cs JOIN station_proposals')) return [[{
      id: 1, proposal_id: 2, chot_so_luong_tru: snapshot, tong_gia_tri_chot: 100, custom_data: custom
    }]];
    if (sql.includes('FROM charging_station_commitments')) return [commitments];
    if (sql.includes('FROM warehouse_export_items i JOIN')) return [evidence];
    if (sql.includes('SELECT id, name FROM charging_poles')) return [[{ id: 5, name: 'DC120' }, { id: 6, name: 'DC60' }]];
    if (sql.includes('SELECT data FROM data_list_rows')) return [[
      { data: { ten: 'DC120', gia: 999 } }, { data: { ten: 'DC60', gia: 200 } }
    ]];
    if (/^(INSERT|UPDATE|DELETE)/.test(sql.trim())) return [{}];
    throw new Error(`Unexpected SQL ${sql}`);
  };
  const connection = { query, beginTransaction: async () => calls.push({ sql: 'begin' }),
    commit: async () => calls.push({ sql: 'commit' }), rollback: async () => calls.push({ sql: 'rollback' }),
    release: () => calls.push({ sql: 'release' }) };
  t.mock.method(pool, 'query', query);
  t.mock.method(pool, 'getConnection', async () => connection);
  return calls;
};

test('proposal fallback is read-only and becomes a priced snapshot only on save', async t => {
  const calls = setup(t, { custom: { mo_hinh_dau_tu: 'NQ_LK',
    loai_tru_nq: [{ loai_tru: 'DC120', so_luong: 2 }], loai_tru_lk: JSON.stringify([{ loai_tru: 'DC60', so_luong: 1 }]) } });
  const current = await service.get(1, superAdmin);
  assert.equal(current.from_proposal, true);
  assert.deepEqual(current.rows.map(r => [r.mo_hinh, r.pole_id, r.so_luong]), [['NQ', 5, 2], ['LK', 6, 1]]);
  assert.equal(calls.some(c => /^(UPDATE|INSERT|DELETE)/.test(c.sql.trim())), false);
  const result = await service.update(1, { expected_token: current.token, rows: current.rows, reason: 'Chốt' }, superAdmin);
  assert.equal(result.total, '2198.00');
  assert.equal(calls.filter(c => c.sql.includes('INSERT INTO charging_station_commitments')).length, 2);
  assert.ok(calls.some(c => c.sql.includes('charging_station_activity_logs')));
  assert.ok(calls.some(c => c.sql === 'commit'));
  assert.equal(calls.some(c => /UPDATE (supplier_charging_poles|charging_poles|warehouse_)/.test(c.sql)), false);
});

test('preserves stable row and price, enforces net exported floor and evidence', async t => {
  const snapshot = [{ source_key: 'line:1', mo_hinh: 'NQ', pole_id: 5, loai_tru: 'DC120', so_luong: 5, gia_chot: 100, note: 'keep' }];
  const commitments = [{ id: 11, source_key: 'line:1', model: 'NQ', pole_id: 5, quantity: 5 }];
  const evidence = [{ id: 10, commitment_id: 11, pole_id: 5, quantity: 4, returned_quantity: 1 }];
  const calls = setup(t, { snapshot, commitments, evidence });
  const current = await service.get(1, superAdmin);
  assert.equal(current.rows[0].min_quantity, 3);
  const update = rows => service.update(1, { rows, reason: 'Điều chỉnh', expected_token: current.token }, superAdmin);
  await assert.rejects(update([{ ...current.rows[0], so_luong: 2 }]), { statusCode: 409 });
  await assert.rejects(update([{ ...current.rows[0], pole_id: 6 }]), { statusCode: 409 });
  await assert.rejects(update([{ mo_hinh: 'LK', pole_id: 6, so_luong: 1 }]), { statusCode: 409 });
  const result = await update([{ ...current.rows[0], so_luong: 3 }, { mo_hinh: 'LK', pole_id: 6, so_luong: 2 }]);
  assert.equal(result.total, '700.00');
  assert.equal(result.rows[0].gia_chot, 100);
  assert.equal(result.rows[0].note, 'keep');
  assert.equal(result.rows[0].source_key, 'line:1');
  assert.ok(calls.some(c => c.sql.startsWith('UPDATE charging_station_commitments') && c.params.at(-1) === 11));
  assert.equal(calls.some(c => c.sql.startsWith('DELETE FROM charging_station_commitments')), false);
});

test('stale version, role and inconsistent legacy evidence fail without writes', async t => {
  const calls = setup(t);
  await assert.rejects(service.get(1, { role: 'ADMIN' }), { statusCode: 403 });
  await assert.rejects(service.update(1, { reason: 'test', rows: [{ mo_hinh: 'NQ', pole_id: 5, so_luong: 1 }], expected_token: 'old' }, superAdmin), { statusCode: 409 });
  assert.equal(calls.some(c => /^(UPDATE|INSERT|DELETE)/.test(c.sql.trim())), false);
  assert.ok(calls.some(c => c.sql === 'rollback'));
});

test('fallback changes invalidate token and NQ legacy table is supported', async t => {
  const custom = { mo_hinh_dau_tu: 'NQ', loai_tru_nq_cs: [{ ten_loai_tru: 'DC120', so_luong: 2 }] };
  setup(t, { custom });
  const current = await service.get(1, superAdmin);
  assert.equal(current.rows[0].so_luong, 2);
  custom.loai_tru_nq_cs[0].so_luong = 3;
  await assert.rejects(service.update(1, { expected_token: current.token, rows: current.rows, reason: 'Chốt mới' }, superAdmin), { statusCode: 409 });
});

test('invalid inputs are rejected and decimal totals are exact', async t => {
  const snapshot = [{ source_key: 'x', mo_hinh: 'NQ', pole_id: 5, loai_tru: 'DC120', so_luong: 1, gia_chot: '10.05' }];
  const commitments = [{ id: 11, source_key: 'x', model: 'NQ', pole_id: 5, quantity: 1 }];
  const calls = setup(t, { snapshot, commitments });
  const current = await service.get(1, superAdmin);
  for (const value of [true, [], {}, 0, ' ', '1.2']) {
    await assert.rejects(service.update(1, { expected_token: current.token, rows: [{ ...current.rows[0], so_luong: value }], reason: 'abc' }, superAdmin), { statusCode: 400 });
  }
  await assert.rejects(service.update(1, { expected_token: current.token, rows: [null], reason: 'abc' }, superAdmin), { statusCode: 400 });
  await assert.rejects(service.update(1, { expected_token: current.token, rows: current.rows, reason: 'a' }, superAdmin), { statusCode: 400 });
  const result = await service.update(1, { expected_token: current.token, rows: [{ ...current.rows[0], so_luong: 3 }], reason: 'abc' }, superAdmin);
  assert.equal(result.total, '30.15');
  assert.equal(result.rows[0].thanh_tien, '30.15');
  assert.equal(calls.some(c => c.sql.includes('fulfillment_review_required=0')), false);
});

test('real SQL preserves evidence, price, inventory and reconciles concurrent export', {
  skip: process.env.RUN_COMMITMENT_SQL_TEST !== '1'
}, async t => {
  const mysql = require('mysql2/promise');
  const admin = await pool.getConnection();
  const [[original]] = await admin.query('SELECT DATABASE() AS name');
  const database = `test_commitment_${Date.now()}`;
  let fixture;
  try {
    await admin.query(`CREATE DATABASE \`${database}\``);
    for (const table of ['station_proposals', 'charging_stations', 'charging_station_commitments',
      'warehouse_exports', 'warehouse_export_items', 'charging_poles', 'supplier_charging_poles',
      'data_list_rows', 'charging_station_activity_logs']) {
      await admin.query(`CREATE TABLE \`${database}\`.\`${table}\` LIKE \`${original.name}\`.\`${table}\``);
    }
    fixture = mysql.createPool({ host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || 'password',
      database, charset: 'utf8mb4', connectionLimit: 4 });
    t.mock.method(pool, 'query', (...args) => fixture.query(...args));
    t.mock.method(pool, 'getConnection', () => fixture.getConnection());
    await fixture.query(`INSERT INTO station_proposals(id,latitude,longitude,owner_name,owner_phone,status,custom_data,chot_so_luong_tru)
      VALUES(1,10,106,'Fixture','0000000000','DEPLOYING',?,?)`,
    [JSON.stringify({ mo_hinh_dau_tu: 'LK' }), JSON.stringify([{ mo_hinh: 'LK', so_luong: 5, pole_id: 1, loai_tru: 'Fixture DC60', gia_chot: 10 }])]);
    await fixture.query("INSERT INTO charging_stations(id,proposal_id,ma_tram,status,sub_status,fulfillment_review_required) VALUES(1,1,'FIXTURE-1','DELIVERING','NOT_DELIVERED',1)");
    await fixture.query("INSERT INTO charging_poles(id,name,charging_type,power_kw,quantity) VALUES(1,'Fixture DC60','DC',60,8)");
    await fixture.query("INSERT INTO charging_station_commitments(id,charging_station_id,model,pole_id,quantity,source_key) VALUES(1,1,'LK',1,5,'line:1')");
    await fixture.query("INSERT INTO warehouse_exports(id,exporter_user_id,export_date,charging_station_id,destination_type,transport_status) VALUES(1,1,NOW(),1,'STATION','DELIVERED')");
    await fixture.query('INSERT INTO warehouse_export_items(id,export_id,pole_id,commitment_id,quantity,received_quantity,returned_quantity) VALUES(1,1,1,1,3,1,1)');
    const before = await service.get(1, superAdmin);
    assert.equal(before.rows[0].min_quantity, 2);
    const transaction = await fixture.getConnection();
    try {
      await transaction.beginTransaction();
      await transaction.query('SELECT id FROM charging_stations WHERE id=1 FOR UPDATE');
      await transaction.query('UPDATE warehouse_export_items SET quantity=4 WHERE id=1');
      const updating = service.update(1, { expected_token: before.token, reason: 'Chốt lại',
        rows: [{ ...before.rows[0], so_luong: 2 }] }, superAdmin);
      await new Promise(resolve => setTimeout(resolve, 100));
      await transaction.commit();
      await assert.rejects(updating, { statusCode: 409 });
    } finally { transaction.release(); }
    const next = await service.get(1, superAdmin);
    assert.equal(next.rows[0].min_quantity, 3);
    await service.update(1, { expected_token: next.token, reason: 'Chốt lại', rows: [{ ...next.rows[0], so_luong: 4 }] }, superAdmin);
    const [[commitment]] = await fixture.query('SELECT * FROM charging_station_commitments WHERE id=1');
    const [[station]] = await fixture.query('SELECT fulfillment_review_required FROM charging_stations WHERE id=1');
    const [[pole]] = await fixture.query('SELECT quantity FROM charging_poles WHERE id=1');
    const [[item]] = await fixture.query('SELECT quantity,returned_quantity FROM warehouse_export_items WHERE id=1');
    const [[proposal]] = await fixture.query('SELECT chot_so_luong_tru,tong_gia_tri_chot FROM station_proposals WHERE id=1');
    assert.equal(commitment.quantity, 4);
    assert.equal(station.fulfillment_review_required, 1);
    assert.equal(pole.quantity, 8);
    assert.equal(item.quantity, 4);
    assert.equal(item.returned_quantity, 1);
    assert.equal(Number(proposal.tong_gia_tri_chot), 40);
    const snapshot = typeof proposal.chot_so_luong_tru === 'string'
      ? JSON.parse(proposal.chot_so_luong_tru) : proposal.chot_so_luong_tru;
    assert.equal(snapshot[0].gia_chot, 10);
  } finally {
    if (fixture) await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    admin.release();
  }
});
