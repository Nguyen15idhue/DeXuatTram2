const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../src/utils/db');
const service = require('../src/services/chargingStationCommitmentService');

test.after(() => pool.end());

test('commitment endpoints enforce SUPER_ADMIN and propagate conflict', async t => {
  const secret = process.env.JWT_SECRET;
  process.env.JWT_SECRET ||= 'commitment-route-test-only';
  const roles = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'CTV', 'NPP', 'MKT'];
  t.mock.method(pool, 'query', async (sql, params) => [[{
    id: params[0], role: roles[params[0] - 1], status: 'ACTIVE', token_version: 0
  }]]);
  let updates = 0;
  t.mock.method(service, 'get', async () => ({ rows: [] }));
  t.mock.method(service, 'update', async () => {
    updates++;
    throw Object.assign(new Error('Tải lại'), { statusCode: 409 });
  });
  const app = express();
  app.use(express.json());
  app.use('/api/admin/charging-stations', require('../src/routes/chargingStations'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/admin/charging-stations/1/commitments`;
    assert.equal((await fetch(url)).status, 401);
    for (let id = 1; id <= roles.length; id++) {
      const headers = { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' };
      assert.equal((await fetch(url, { headers })).status, id === 1 ? 200 : 403);
      assert.equal((await fetch(url, { method: 'PUT', headers, body: '{}' })).status, id === 1 ? 409 : 403);
    }
    assert.equal(updates, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (secret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = secret;
  }
});
