const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'lead-portal-test';
process.env.LEAD_PORTAL_USER_ID = '51';
const pool = require('../src/utils/db');
const { restrictLeadPortal, requireAuth, requireLeadManager, requireLeadWriter } = require('../src/middlewares/auth');
const leadAccess = require('../src/services/lead/leadAccessService.js');

test('only the configured active MKT can manage all leads, without changing its actor role', async () => {
  const executor = {
    query: async (_, [id]) => [[{ id, role: 'MKT', status: id === 53 ? 'LOCKED' : 'ACTIVE', custom_data: {} }]]
  };
  assert.equal(await leadAccess.buildScope({ id: 51 }, executor), null);
  const can = await leadAccess.permissions({ assigned_user_id: 999 }, { id: 51 }, executor);
  assert.deepEqual(can, { can_view: true, can_consult: true, can_assign: true, can_write_general: true });
  assert.equal((await leadAccess.getContext({ id: 51 }, executor)).role, 'MKT');
  await assert.rejects(leadAccess.buildScope({ id: 52 }, executor), { statusCode: 403 });
});

test('portal access permits lead operations and map reads but denies other modules', async (t) => {
  const oldQuery = pool.query;
  const accounts = {
    51: { id: 51, role: 'MKT', status: 'ACTIVE', token_version: 0 },
    52: { id: 52, role: 'MKT', status: 'ACTIVE', token_version: 0 },
    53: { id: 53, role: 'SUPER_ADMIN', status: 'ACTIVE', token_version: 0 }
  };
  pool.query = async (sql, [id]) => {
    assert.match(sql, /FROM users WHERE id/);
    return [accounts[id] ? [accounts[id]] : []];
  };
  t.after(() => { pool.query = oldQuery; });

  const app = express();
  app.use(express.json(), restrictLeadPortal);
  app.get('/api/admin/leads', requireAuth, requireLeadManager, (req, res) => res.json(req.user));
  app.post('/api/admin/leads', requireAuth, requireLeadWriter, (req, res) => res.json(req.user));
  app.use((req, res) => res.sendStatus(204));
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', { id = 51, body, tokenVersion = 0 } = {}) => fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${jwt.sign({ id, role: accounts[id].role, tokenVersion }, process.env.JWT_SECRET)}`,
      'Content-Type': 'application/json'
    },
    body: body && JSON.stringify(body)
  });

  assert.equal((await (await request('/api/admin/leads')).json()).role, 'MKT');
  assert.equal((await request('/api/admin/leads', 'POST')).status, 200);
  assert.equal((await request('/api/admin/leads', 'POST', { id: 52 })).status, 403);
  assert.equal((await request('/api/admin/leads', 'POST', { id: 53 })).status, 200);
  for (const [path, method] of [
    ['/api/admin/reports', 'GET'],
    ['/api/files/10/download', 'GET'],
    ['/api/stations?limit=20', 'GET'],
    ['/api/admin/leads/10/create-proposal', 'POST'],
    ['/api/proposals', 'POST']
  ]) {
    assert.equal((await request(path, method)).status, 403, path);
  }
  assert.equal((await request('/api/proposals')).status, 204);
  assert.equal((await request('/api/admin/excel/import/confirm?entity=leads', 'POST', { body: { entity: 'users' } })).status, 403);
  assert.equal((await request('/api/admin/excel/import/confirm', 'POST', { body: { entity: 'leads' } })).status, 204);
  assert.equal((await request('/api/admin/leads', 'GET', { tokenVersion: 1 })).status, 401);
  accounts[51].status = 'LOCKED';
  assert.equal((await request('/api/admin/leads')).status, 403);
});
