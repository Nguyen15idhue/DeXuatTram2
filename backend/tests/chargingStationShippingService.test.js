const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');

const serviceDirectory = path.resolve(__dirname, '../src/services');

const loadWithMocks = (filename, mocks) => {
  const filePath = path.join(serviceDirectory, filename);
  const nativeLoad = Module._load;
  delete require.cache[filePath];
  Module._load = function (request, parent, isMain) {
    if (Object.hasOwn(mocks, request)) return mocks[request];
    return nativeLoad.call(this, request, parent, isMain);
  };
  return {
    service: require(filePath),
    restore: () => { Module._load = nativeLoad; }
  };
};

const createConnection = (query) => {
  const calls = [];
  return {
    calls,
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    query: async (sql, params = []) => {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      return query(sql.replace(/\s+/g, ' ').trim(), params);
    }
  };
};

test('createExport requires a request id before any inventory or shipment write', async () => {
  const connection = createConnection((sql) => {
    if (sql.includes('FROM charging_stations WHERE id = ? FOR UPDATE')) {
      return [[{ id: 5, status: 'DELIVERING' }], []];
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  const pool = { getConnection: async () => connection };
  const access = {
    assertBackOffice: async () => {},
    assertView: async () => {}
  };
  const { service, restore } = loadWithMocks('chargingStationShippingService.js', {
    '../utils/db': pool,
    './chargingStationAccessService': access
  });

  try {
    await assert.rejects(
      service.createExport(5, { items: [{ commitment_id: 1, quantity: 1 }] }, { id: 9, role: 'SUPER_ADMIN' }),
      (error) => error.statusCode === 400 && /request_id/.test(error.message)
    );
  } finally {
    restore();
  }
  assert.equal(connection.calls.filter((call) => call === 'rollback').length, 1);
  assert.equal(connection.calls.some((call) => typeof call === 'object' && call.sql.startsWith('INSERT INTO')), false);
});

test('createExport returns an identical prior request without decrementing stock twice', async () => {
  const payload = {
    items: [{ commitment_id: 3, quantity: 5 }],
    carrier: null,
    transport_code: null,
    reason: null,
    total_amount: null
  };
  const result = { id: 42, items: [{ id: 99, quantity: 5 }] };
  const connection = createConnection((sql) => {
    if (sql.includes('FROM charging_stations WHERE id = ? FOR UPDATE')) {
      return [[{ id: 5, status: 'DELIVERING' }], []];
    }
    if (sql.includes('FROM charging_station_fulfillment_events')) {
      return [[{
        operation: 'SHIPPING_CREATE_EXPORT',
        payload: JSON.stringify(payload),
        result: JSON.stringify(result)
      }], []];
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  const pool = { getConnection: async () => connection };
  const access = {
    assertBackOffice: async () => {},
    assertView: async () => {}
  };
  const { service, restore } = loadWithMocks('chargingStationShippingService.js', {
    '../utils/db': pool,
    './chargingStationAccessService': access
  });

  let shipment;
  try {
    shipment = await service.createExport(
      5,
      { request_id: 'ship-42', items: [{ commitment_id: 3, quantity: 2 }, { commitment_id: 3, quantity: 3 }] },
      { id: 9, role: 'SUPER_ADMIN' }
    );
  } finally {
    restore();
  }
  assert.deepEqual(shipment, result);
  assert.equal(connection.calls.filter((call) => call === 'commit').length, 1);
  assert.equal(connection.calls.some((call) => typeof call === 'object' && call.sql.startsWith('INSERT INTO')), false);
});

test('generic warehouse station exports delegate to the commitment-aware shipping service', async () => {
  const delegated = [];
  const shipping = {
    createExportWithinTransaction: async (...args) => {
      delegated.push(args);
      return { id: 73 };
    }
  };
  const { service, restore } = loadWithMocks('warehouseService.js', {
    '../utils/db': {},
    './chargingStationShippingService': shipping
  });
  const connection = {};
  const payload = {
    destination_type: 'STATION',
    charging_station_id: 11,
    request_id: 'legacy-route-73',
    items: [{ commitment_id: 4, quantity: 1 }]
  };
  let id;
  try {
    id = await service.createExportWithinTransaction(connection, payload, { userId: 7 });
  } finally {
    restore();
  }

  assert.equal(id, 73);
  assert.equal(delegated.length, 1);
  assert.deepEqual(delegated[0], [connection, 11, payload, { id: 7 }, { userId: 7 }]);
});

test('return requests can reserve undelivered quantities but never return received deployment portions', async () => {
  const connection = createConnection((sql) => {
    if (sql.includes('FROM charging_stations WHERE id = ? FOR UPDATE')) {
      return [[{ id: 5, status: 'DELIVERING' }], []];
    }
    if (sql.includes('FROM charging_station_fulfillment_events')) return [[], []];
    if (sql.includes('FROM warehouse_export_items wei') && sql.includes('FOR UPDATE')) {
      return [[{
        id: 20,
        export_id: 7,
        charging_station_id: 5,
        destination_type: 'STATION',
        transport_status: 'FAILED',
        commitment_id: 3,
        quantity: 8,
        received_quantity: 3,
        returned_quantity: 0,
        return_pending_quantity: 0,
        supplier_id: 2,
        pole_id: 4
      }], []];
    }
    if (sql.includes('UPDATE warehouse_export_items SET return_pending_quantity')) return [{ affectedRows: 1 }, []];
    if (sql.includes('SELECT * FROM warehouse_exports WHERE id = ?')) return [[{ id: 7, transport_status: 'FAILED' }], []];
    if (sql.includes('FROM warehouse_export_items wei') && sql.includes('WHERE wei.export_id = ?')) {
      return [[{ id: 20, export_id: 7, quantity: 8, received_quantity: 3, return_pending_quantity: 4, returned_quantity: 0 }], []];
    }
    if (sql.includes('INSERT INTO charging_station_fulfillment_events')) return [{ insertId: 1 }, []];
    throw new Error(`Unexpected query: ${sql}`);
  });
  const access = {
    assertBackOffice: async () => {},
    assertView: async () => {}
  };
  const stationService = { writeActivity: async () => {} };
  const { service, restore } = loadWithMocks('chargingStationShippingService.js', {
    '../utils/db': { getConnection: async () => connection },
    './chargingStationAccessService': access,
    './chargingStationService': stationService
  });
  try {
    await assert.rejects(
      service.requestReturn(
        5,
        7,
        { request_id: 'return-too-many', reason: 'Giao thiếu', items: [{ item_id: 20, quantity: 6 }] },
        { id: 9, role: 'SUPER_ADMIN' }
      ),
      (error) => error.statusCode === 409 && /chưa nhận/.test(error.message)
    );
    const shipment = await service.requestReturn(
      5,
      7,
      { request_id: 'return-undelivered', reason: 'Giao thiếu', items: [{ item_id: 20, quantity: 4 }] },
      { id: 9, role: 'SUPER_ADMIN' }
    );
    assert.equal(shipment.items[0].return_pending_quantity, 4);
    assert.equal(connection.calls.some((call) => typeof call === 'object'
      && /charging_station_deployments|supplier_charging_poles/.test(call.sql)), false);
  } finally {
    restore();
  }
});
