const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const pool = require('./src/utils/db');

test('mixed-model shipping selects suppliers and restores only the actual supplier stock', {
  skip: process.env.ON_PARTIAL_INTEGRATION !== '1', timeout: 60000
}, async () => {
  const connection = await pool.getConnection();
  const originalQuery = pool.query;
  const originalGetConnection = pool.getConnection;
  let serial = 0;
  await connection.beginTransaction();
  pool.query = (...args) => connection.query(...args);
  pool.getConnection = async () => {
    const savepoint = `supplier_test_${++serial}`;
    return {
      query: (...args) => connection.query(...args),
      beginTransaction: () => connection.query(`SAVEPOINT ${savepoint}`),
      commit: () => connection.query(`RELEASE SAVEPOINT ${savepoint}`),
      rollback: () => connection.query(`ROLLBACK TO SAVEPOINT ${savepoint}`),
      release: () => {}
    };
  };
  const shipping = require('./src/services/chargingStationShippingService');
  const suffix = Date.now();
  try {
    const [user] = await connection.query(
      "INSERT INTO users(full_name,email,password,role,status) VALUES(?,?,?,'SUPER_ADMIN','ACTIVE')",
      ['Shipping fixture', `supplier-${suffix}@example.invalid`, 'not-a-login-password']
    );
    const actor = { id: user.insertId, role: 'SUPER_ADMIN' };
    const supplierIds = [];
    for (const name of ['A', 'B']) {
      const [supplier] = await connection.query('INSERT INTO suppliers(name) VALUES(?)', [`Supplier ${name} ${suffix}`]);
      supplierIds.push(supplier.insertId);
    }
    const poles = [];
    for (const power of [60, 30]) {
      const [pole] = await connection.query(
        "INSERT INTO charging_poles(name,charging_type,power_kw,quantity) VALUES(?,'DC',?,20)",
        [`Supplier test ${power} ${suffix}`, power]
      );
      poles.push(pole.insertId);
      for (const supplierId of supplierIds) {
        await connection.query('INSERT INTO supplier_charging_poles(supplier_id,charging_pole_id,quantity) VALUES(?,?,10)',
          [supplierId, pole.insertId]);
      }
    }
    const [proposal] = await connection.query(
      `INSERT INTO station_proposals(user_id,latitude,longitude,owner_name,owner_phone,address,status,custom_data,chot_so_luong_tru)
       VALUES(?,10,106,'Shipping fixture','0900000000','Fixture','APPROVED',?,?)`,
      [actor.id, JSON.stringify({ mo_hinh_dau_tu: 'NQ_LK', ma_de_xuat: `SUPPLIER_${suffix}` }),
        JSON.stringify([
          { mo_hinh: 'NQ', pole_id: poles[0], so_luong: 1 },
          { mo_hinh: 'LK', pole_id: poles[0], so_luong: 1 },
          { mo_hinh: 'LK', pole_id: poles[1], so_luong: 1 }
        ])]
    );
    const [station] = await connection.query(
      "INSERT INTO charging_stations(proposal_id,status) VALUES(?,'ONBOARDING')", [proposal.insertId]
    );
    const id = station.insertId;
    await shipping.ensureCommitments(connection, id);
    const summary = await shipping.getSummary(id);
    assert.equal(summary.items.length, 3);
    assert.equal(summary.pole_requirements.length, 2);
    assert.equal(summary.shipping_options.length, 4);
    assert.equal(summary.pole_requirements.find((row) => row.pole_id === poles[0]).remaining_quantity, 2);
    const warehouseItems = await require('./src/services/chargingStationService').getCommittedExportItems(id);
    assert.equal(warehouseItems.length, 2);
    assert.equal(warehouseItems.find((row) => row.pole_id === poles[0]).remaining_quantity, 2);
    assert.equal(warehouseItems.find((row) => row.pole_id === poles[0]).stock_quantity, 20);
    const body = {
      request_id: randomUUID(), carrier: 'Fixture', transport_code: 'Fixture', total_amount: 0,
      items: [{ pole_id: poles[0], supplier_id: supplierIds[1], quantity: 2 }]
    };
    await connection.query(
      'UPDATE supplier_charging_poles SET quantity=1 WHERE supplier_id=? AND charging_pole_id=?',
      [supplierIds[1], poles[0]]
    );
    await assert.rejects(() => shipping.createExport(id, body, actor), { statusCode: 409 });
    await connection.query(
      'UPDATE supplier_charging_poles SET quantity=10 WHERE supplier_id=? AND charging_pole_id=?',
      [supplierIds[1], poles[0]]
    );
    const shipment = await shipping.createExport(id, body, actor);
    assert.equal(shipment.items.length, 2);
    assert.ok(shipment.items.every((row) => Number(row.supplier_id) === supplierIds[1]));
    assert.equal((await shipping.createExport(id, body, actor)).id, shipment.id);
    await assert.rejects(() => shipping.createExport(id, { ...body, request_id: randomUUID() }, actor), { statusCode: 409 });
    const stock = async (supplierId) => {
      const [[row]] = await connection.query(
        'SELECT quantity FROM supplier_charging_poles WHERE supplier_id=? AND charging_pole_id=?',
        [supplierId, poles[0]]
      );
      return Number(row.quantity);
    };
    assert.equal(await stock(supplierIds[0]), 10);
    assert.equal(await stock(supplierIds[1]), 8);
    await shipping.markFailed(id, shipment.id, { request_id: randomUUID(), reason: 'Fixture return' }, actor);
    await shipping.requestReturn(id, shipment.id, {
      request_id: randomUUID(), reason: 'Fixture return requested',
      items: shipment.items.map((row) => ({ item_id: row.id, quantity: row.quantity }))
    }, actor);
    await shipping.confirmReturn(id, shipment.id, {
      request_id: randomUUID(), reason: 'Fixture return received',
      items: shipment.items.map((row) => ({ item_id: row.id, quantity: row.quantity }))
    }, actor);
    assert.equal(await stock(supplierIds[1]), 10);
    assert.equal((await shipping.getSummary(id)).totals.remaining, 3);
    await connection.query('UPDATE supplier_charging_poles SET quantity=0 WHERE supplier_id IN (?,?)', supplierIds);
    assert.equal((await shipping.getSummary(id)).shipping_options.length, 0);
    await assert.rejects(() => shipping.createExport(id, { ...body, request_id: randomUUID() }, actor), { statusCode: 409 });
  } finally {
    pool.query = originalQuery;
    pool.getConnection = originalGetConnection;
    await connection.rollback();
    connection.release();
    await pool.end();
  }
});
