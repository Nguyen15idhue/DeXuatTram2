const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const service = require('../src/services/supplierService');
const warehouse = require('../src/services/warehouseService');

const admin = { id: 1, role: 'ADMIN' };
const backOffice = { id: 2, role: 'SALES' };
test.after(() => pool.end());

const setup = (t) => {
  const stock = new Map([[1, 7], [2, 4]]);
  const calls = [];
  let total = 11;
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    query: async (sql, params) => {
      calls.push(sql);
      if (sql.startsWith('SELECT id FROM')) return [[{ id: params[0] }]];
      if (sql.startsWith('INSERT INTO supplier_charging_poles')) {
        if (!stock.has(params[0])) stock.set(params[0], 0);
        return [{}];
      }
      if (sql.includes('SELECT quantity FROM supplier_charging_poles')) {
        assert.match(sql, /FOR UPDATE/);
        return [stock.has(params[0]) ? [{ quantity: stock.get(params[0]) }] : []];
      }
      if (sql.startsWith('UPDATE supplier_charging_poles')) {
        stock.set(params[1], params[0]);
        return [{}];
      }
      if (sql.startsWith('UPDATE charging_poles')) {
        total = [...stock.values()].reduce((sum, quantity) => sum + quantity, 0);
        return [{}];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  return { stock, calls, connection, total: () => total };
};

test('admin and super admin can reduce, increase and zero supplier stock without changing other suppliers', async t => {
  const state = setup(t);
  for (const [quantity, role] of [[3, 'ADMIN'], [12, 'SUPER_ADMIN'], [0, 'ADMIN']]) {
    const result = await service.adjustStock(1, 9, { quantity, expected_quantity: state.stock.get(1) }, { ...admin, role });
    assert.equal(result.quantity, quantity);
    assert.equal(state.stock.get(2), 4);
    assert.equal(state.total(), quantity + 4);
  }
  assert.equal(state.calls.filter(call => call === 'commit').length, 3);
});

test('invalid quantities and roles fail before opening a transaction', async t => {
  const state = setup(t);
  for (const value of [undefined, null, '', ' ', -1, 1.5, 'abc', true, [], {}, 2147483648]) {
    await assert.rejects(service.adjustStock(1, 9, { quantity: value, expected_quantity: 7 }, admin), { statusCode: 400 });
    await assert.rejects(service.adjustStock(1, 9, { quantity: 0, expected_quantity: value }, admin), { statusCode: 400 });
  }
  for (const role of ['SALES', 'CTV', 'NPP', 'MKT', undefined]) {
    await assert.rejects(service.adjustStock(1, 9, { quantity: 0, expected_quantity: 7 }, { role }), { statusCode: 403 });
  }
  assert.deepEqual(state.calls, []);
});

test('stale and missing stock rolls back without inventory writes', async t => {
  const state = setup(t);
  await assert.rejects(service.adjustStock(1, 9, { quantity: 8, expected_quantity: 6 }, admin), { statusCode: 409 });
  await assert.rejects(service.adjustStock(3, 9, { quantity: 8, expected_quantity: 0 }, admin), { statusCode: 404 });
  assert.equal(state.calls.some(call => call.startsWith('UPDATE')), false);
  assert.equal(state.calls.filter(call => call === 'rollback').length, 2);
  assert.equal(state.calls.filter(call => call === 'release').length, 2);
});

test('total synchronization failure rolls back instead of committing a partial update', async t => {
  const state = setup(t);
  const query = state.connection.query;
  state.connection.query = async (sql, params) => {
    if (sql.startsWith('UPDATE charging_poles')) throw new Error('total write failed');
    return query(sql, params);
  };
  await assert.rejects(service.adjustStock(1, 9, { quantity: 0, expected_quantity: 7 }, admin), /total write failed/);
  assert.ok(state.calls.includes('rollback'));
  assert.equal(state.calls.includes('commit'), false);
  assert.equal(state.calls.at(-1), 'release');
});

test('legacy assignment preserves existing stock when omitted and protects explicit changes', async t => {
  const state = setup(t);
  await service.assignPole(1, 9, undefined, backOffice);
  await service.assignPole(3, 9, 0, backOffice);
  assert.equal(state.stock.get(1), 7);
  assert.equal(state.stock.get(3), 0);
  await assert.rejects(service.assignPole(1, 9, 0, backOffice, 7), { statusCode: 403 });
  await assert.rejects(service.assignPole(1, 9, 2, admin), { statusCode: 400 });
  await assert.rejects(service.assignPole(1, 9, 2, admin, 5), { statusCode: 409 });
  await service.assignPole(1, 9, 2, admin, 7);
  assert.equal(state.total(), 6);
});

test('stock endpoint enforces real JWT roles and exposes stale stock as HTTP 409', async t => {
  const secret = process.env.JWT_SECRET;
  process.env.JWT_SECRET ||= 'warehouse-route-test-only';
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const app = express();
  app.use(express.json());
  app.use('/api/admin/warehouse', require('../src/routes/warehouse'));
  const roles = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'CTV', 'NPP', 'MKT'];
  t.mock.method(pool, 'query', async (sql, params) => [[{
    id: params[0], role: roles[params[0] - 1], status: 'ACTIVE', token_version: 0
  }]]);
  const writes = [];
  t.mock.method(service, 'adjustStock', async (sid, pid, data, user) => {
    writes.push({ sid, pid, data, user });
    if (data.expected_quantity === 6) throw Object.assign(new Error('Số lượng tồn đã thay đổi'), { statusCode: 409 });
    return { quantity: data.quantity };
  });
  t.mock.method(console, 'error', () => {});
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/admin/warehouse/stock/1/9`;
    assert.equal((await fetch(url, { method: 'PATCH' })).status, 401);
    for (let id = 1; id <= roles.length; id++) {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 0, expected_quantity: 7 })
      });
      assert.equal(response.status, id <= 2 ? 200 : 403);
    }
    assert.equal(writes.length, 2);
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${jwt.sign({ id: 1 }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: 0, expected_quantity: 6 })
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'STOCK_CONFLICT');
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (secret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = secret;
  }
});

test('MySQL stock adjustment, ordering and concurrent movements stay consistent', {
  skip: process.env.RUN_WAREHOUSE_INTEGRATION_TESTS !== '1'
}, async () => {
  const prefix = `Warehouse-test-${process.pid}-${Date.now()}`;
  const suppliers = [];
  const poles = [];
  let movement;
  try {
    for (let i = 0; i < 2; i++) {
      const [row] = await pool.query('INSERT INTO suppliers (name) VALUES (?)', [`${prefix}-${i}`]);
      suppliers.push(row.insertId);
    }
    for (const power of [120, 7, 22]) {
      const [row] = await pool.query(
        'INSERT INTO charging_poles (name, charging_type, power_kw, quantity) VALUES (?, ?, ?, 0)',
        [`${prefix}-${power}`, 'DC', power]
      );
      poles.push(row.insertId);
      for (const sid of suppliers) await service.assignPole(sid, row.insertId, 0, admin);
    }
    assert.deepEqual((await warehouse.listPoles({ search: prefix, limit: 2 })).items.map(row => Number(row.power_kw)), [7, 22]);
    assert.deepEqual((await warehouse.listPoles({ search: prefix, limit: 2, page: 2 })).items.map(row => Number(row.power_kw)), [120]);
    assert.deepEqual((await service.listPolesBySupplier(suppliers[0])).map(row => Number(row.power_kw)), [7, 22, 120]);
    await service.adjustStock(suppliers[0], poles[0], { quantity: 7, expected_quantity: 0 }, admin);
    await service.adjustStock(suppliers[1], poles[0], { quantity: 4, expected_quantity: 0 }, admin);
    const attempts = await Promise.allSettled([8, 9].map(quantity =>
      service.adjustStock(suppliers[0], poles[0], { quantity, expected_quantity: 7 }, admin)));
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(attempts.find(result => result.status === 'rejected').reason.statusCode, 409);
    const current = attempts.find(result => result.status === 'fulfilled').value.quantity;
    movement = await pool.getConnection();
    await movement.beginTransaction();
    await movement.query('SELECT quantity FROM supplier_charging_poles WHERE supplier_id = ? AND charging_pole_id = ? FOR UPDATE', [suppliers[0], poles[0]]);
    const adjustment = service.adjustStock(suppliers[0], poles[0], { quantity: 0, expected_quantity: current }, admin);
    const rejected = assert.rejects(adjustment, { statusCode: 409 });
    await movement.query('UPDATE supplier_charging_poles SET quantity = quantity - 1 WHERE supplier_id = ? AND charging_pole_id = ?', [suppliers[0], poles[0]]);
    await movement.query('UPDATE charging_poles SET quantity = (SELECT SUM(quantity) FROM supplier_charging_poles WHERE charging_pole_id = ?) WHERE id = ?', [poles[0], poles[0]]);
    await movement.commit();
    await rejected;
    const [[total]] = await pool.query('SELECT quantity FROM charging_poles WHERE id = ?', [poles[0]]);
    assert.equal(total.quantity, current - 1 + 4);
    await service.adjustStock(suppliers[0], poles[0], { quantity: 0, expected_quantity: current - 1 }, admin);
    const [[zeroed]] = await pool.query('SELECT quantity FROM charging_poles WHERE id = ?', [poles[0]]);
    assert.equal(zeroed.quantity, 4);
  } finally {
    if (movement) {
      await movement.rollback();
      movement.release();
    }
    for (const poleId of poles) {
      await pool.query('DELETE FROM supplier_charging_poles WHERE charging_pole_id = ?', [poleId]);
      await pool.query('DELETE FROM charging_poles WHERE id = ?', [poleId]);
    }
    for (const supplierId of suppliers) await pool.query('DELETE FROM suppliers WHERE id = ?', [supplierId]);
  }
});
