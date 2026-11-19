const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/utils/db');
const { getNearbyStations } = require('../src/services/evReportService');

test('public nearby returns both sources within 50 km, sorted, without proposal details', async t => {
  const longitudeAt = meters => meters / 6371000 * 180 / Math.PI;
  const point = (source, id, meters, status = 'ACTIVE') => ({
    source, id, status, latitude: '0', longitude: String(longitudeAt(meters)),
    name: 'Test station', address: 'Test address', owner_phone: 'private',
    owner_name: 'private', mo_hinh_tram: 'TDT', custom_data: { private: true },
  });
  t.mock.method(pool, 'query', async () => [[
    point('proposal', 4, 49999, 'DEPLOYING'),
    point('station', 4, 1500),
    point('proposal', 5, 50001),
    point('proposal', 6, 2500),
    { ...point('station', 7, 0), longitude: null },
    { ...point('proposal', 8, 0), longitude: '181' },
  ]]);
  const result = await getNearbyStations({ latitude: 0, longitude: 0 });
  assert.deepEqual(result.map(row => row.id), ['station:4', 'proposal:6', 'proposal:4']);
  assert.equal(result[0].address, 'Test address');
  assert.equal(result[0].owner_phone, undefined);
  assert.deepEqual(Object.keys(result[1]).sort(), [
    'distance_m', 'id', 'latitude', 'longitude', 'source', 'status',
  ]);
  assert.equal(result[2].status, 'DEPLOYING');
  assert.ok(Math.abs(result[2].distance_m - 49999) < 0.01);
});

test('rejects invalid public search coordinates before querying MySQL', async t => {
  const query = t.mock.method(pool, 'query', async () => [[]]);
  for (const latitude of [null, '', '  ', true, [], {}, 90.01, Infinity, 'invalid']) {
    await assert.rejects(getNearbyStations({ latitude, longitude: 0 }), { statusCode: 400 });
  }
  await assert.rejects(getNearbyStations({ latitude: 0, longitude: -181 }), { statusCode: 400 });
  assert.equal(query.mock.callCount(), 0);
});
