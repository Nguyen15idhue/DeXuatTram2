const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Module = require('node:module');
process.env.JWT_SECRET ||= 'historical-import-route-test-only';
const { requireSuperAdmin } = require('../src/middlewares/auth');
const { verifyProof } = require('../src/services/historicalOnImport/historicalOnImportProof');

test('preview and confirmation require SUPER_ADMIN and bind confirmation to the validated file', async () => {
  const nativeLoad = Module._load;
  let writes = 0;
  const auth = {
    requireAuth(req, res, next) {
      if (!req.headers['x-test-role']) return res.status(401).json({ success: false });
      req.user = { id: 1, role: req.headers['x-test-role'] };
      next();
    },
    requireSuperAdmin
  };
  Module._load = function (request, parent, isMain) {
    if (parent?.filename.endsWith('historicalOnImport.js')) {
      if (request === '../middlewares/auth') return auth;
      if (request === '../middlewares/rateLimits') return { excelLimiter: (req, res, next) => next() };
      if (request === '../services/historicalOnImport/historicalOnImportPreview') return {
        loadCatalog: async () => ({ poles: [{ id: 1, name: 'AC 22kW' }] }),
        preview: async buffer => [{ row: 2, action: 'create', errors: buffer.toString() === 'invalid' ? ['Sai'] : [], warnings: [] }]
      };
      if (request === '../services/historicalOnImport/historicalOnImportTransaction') return {
        executeConfirmation: async ({ buffer, proof, actor, writeRow }) => {
          verifyProof(proof, buffer, actor);
          assert.equal(typeof writeRow, 'function');
          writes++;
          return { rows: [{ row: 2, action: 'create', proposal_id: 1 }] };
        }
      };
    }
    return nativeLoad.call(this, request, parent, isMain);
  };
  let router;
  try { router = require('../src/routes/historicalOnImport'); } finally { Module._load = nativeLoad; }
  const app = express();
  app.use('/import', router);
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const url = `http://127.0.0.1:${server.address().port}/import`;
    assert.equal((await fetch(`${url}/template`)).status, 401);
    assert.equal((await fetch(`${url}/template`, { headers: { 'x-test-role': 'ADMIN' } })).status, 403);
    const template = await fetch(`${url}/template`, { headers: { 'x-test-role': 'SUPER_ADMIN' } });
    assert.equal(template.status, 200);
    assert.match(template.headers.get('content-type'), /spreadsheetml/);
    const makeFile = (content, proof) => {
      const file = new FormData();
      file.append('file', new Blob([content]), 'test.xlsx');
      if (proof) file.append('proof', proof);
      return file;
    };
    const response = await fetch(`${url}/preview`, {
      method: 'POST', headers: { 'x-test-role': 'SUPER_ADMIN' }, body: makeFile('fixture')
    });
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.import_available, true);
    assert.ok(data.proof);
    const invalid = await fetch(`${url}/preview`, { method: 'POST', headers: { 'x-test-role': 'SUPER_ADMIN' }, body: makeFile('invalid') });
    assert.equal((await invalid.json()).data.proof, null);
    assert.equal((await fetch(`${url}/confirm`, {
      method: 'POST', headers: { 'x-test-role': 'ADMIN' }, body: makeFile('fixture', data.proof)
    })).status, 403);
    assert.equal((await fetch(`${url}/confirm`, {
      method: 'POST', headers: { 'x-test-role': 'SUPER_ADMIN' }, body: makeFile('fixture')
    })).status, 400);
    assert.equal((await fetch(`${url}/confirm`, {
      method: 'POST', headers: { 'x-test-role': 'SUPER_ADMIN' }, body: makeFile('modified', data.proof)
    })).status, 400);
    const confirmed = await fetch(`${url}/confirm`, {
      method: 'POST', headers: { 'x-test-role': 'SUPER_ADMIN' }, body: makeFile('fixture', data.proof)
    });
    assert.equal(confirmed.status, 200);
    assert.equal((await confirmed.json()).data.rows[0].proposal_id, 1);
    assert.equal(writes, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

