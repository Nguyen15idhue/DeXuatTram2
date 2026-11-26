const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET ||= 'proposal-map-privacy-test';
const pool = require('../src/utils/db');
const proposalService = require('../src/services/proposal/proposalService.js');
const router = require('../src/routes/proposal/proposals.js');
const { forMap } = require('../src/services/proposal/proposalMapDisplay.js');

const proposal = {
  id: 10, latitude: 21, longitude: 105, status: 'PENDING',
  address: 'Địa chỉ riêng', mo_hinh_dau_tu: 'NQ_LK', ma_de_xuat: 'DX10',
  owner_name: 'Chủ đề xuất', owner_phone: '0999999999', loai_tru: '',
  tdt_tru: JSON.stringify([{ loai_tru: 'AC 7', so_luong: 5 }]),
  loai_tru_nq: JSON.stringify([{ loai_tru: 'DC 30', so_luong: 1 }]),
  loai_tru_lk: [{ loai_tru: 'DC 60', so_luong: 2 }]
};

test('map pole summaries preserve the two popup calculations without exposing model tables', () => {
  const result = forMap(proposal, { role: 'SALES' });
  assert.equal(result.map_pole_summary, '1× DC 30 + 2× DC 60 (tổng 3 trụ)');
  assert.equal(result.nearby_pole_summary, '5× AC 7 + 1× DC 30 + 2× DC 60 (tổng 8 trụ)');
  for (const key of ['address', 'mo_hinh_dau_tu', 'tdt_tru', 'loai_tru_nq', 'loai_tru_lk']) {
    assert.equal(Object.hasOwn(result, key), false, key);
  }
  assert.equal(proposal.address, 'Địa chỉ riêng');
  assert.equal(forMap({ ...proposal, mo_hinh_dau_tu: 'LK', loai_tru_lk: [] }, { role: 'CTV' }).map_pole_summary, '');
  assert.equal(forMap({ ...proposal, mo_hinh_dau_tu: 'NQ', loai_tru_nq: null, loai_tru: 'DC 20' }, { role: 'CTV' }).map_pole_summary, 'DC 20');
});

test('map endpoints enforce current account role and session for both list and item', async () => {
  const oldQuery = pool.query;
  const oldAll = proposalService.getAllProposals;
  const oldOne = proposalService.getProposalById;
  const accounts = new Map([
    [1, { id: 1, role: 'SUPER_ADMIN', status: 'ACTIVE', token_version: 0 }],
    [2, { id: 2, role: 'ADMIN', status: 'ACTIVE', token_version: 0 }],
    [3, { id: 3, role: 'SALES', status: 'ACTIVE', token_version: 0 }],
    [4, { id: 4, role: 'CTV', status: 'ACTIVE', token_version: 0 }],
    [5, { id: 5, role: 'NPP', status: 'ACTIVE', token_version: 0 }],
    [6, { id: 6, role: 'MKT', status: 'ACTIVE', token_version: 0 }],
    [7, { id: 7, role: 'ADMIN', status: 'LOCKED', token_version: 0 }],
    [8, { id: 8, role: 'ADMIN', status: 'ACTIVE', token_version: 1 }]
  ]);
  pool.query = async (sql, params) => {
    assert.match(sql, /FROM users WHERE id/);
    const user = accounts.get(params[0]);
    return [user ? [user] : []];
  };
  proposalService.getAllProposals = async () => [proposal];
  proposalService.getProposalById = async id => id === '10' ? proposal : null;
  const app = express();
  app.use('/api/proposals', router);
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/proposals`;
  const token = (id, role = 'ADMIN') => jwt.sign({ id, role, tokenVersion: 0 }, process.env.JWT_SECRET);
  try {
    for (const path of ['', '/10']) {
      for (const id of [null, 1, 2, 3, 4, 5, 6]) {
        const res = await fetch(base + path, id ? { headers: { authorization: `Bearer ${token(id)}` } } : {});
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('cache-control'), 'private, no-store');
        const body = await res.json();
        const item = path ? body.data : body.data[0];
        if (id === 1 || id === 2) {
          assert.equal(item.address, proposal.address);
          assert.equal(item.mo_hinh_dau_tu, 'NQ_LK');
        } else {
          for (const key of ['address', 'mo_hinh_dau_tu', 'tdt_tru', 'loai_tru_nq', 'loai_tru_lk']) {
            assert.equal(Object.hasOwn(item, key), false, `${path} user ${id}: ${key}`);
          }
          assert.equal(item.map_pole_summary, '1× DC 30 + 2× DC 60 (tổng 3 trụ)');
        }
        if (!id) assert.equal(Object.hasOwn(item, 'owner_phone'), false);
      }
      assert.equal((await fetch(base + path, { headers: { authorization: 'Bearer invalid' } })).status, 401);
      const expired = jwt.sign({ id: 2, role: 'ADMIN', tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: -1 });
      assert.equal((await fetch(base + path, { headers: { authorization: `Bearer ${expired}` } })).status, 401);
      assert.equal((await fetch(base + path, { headers: { authorization: `Bearer ${token(7)}` } })).status, 403);
      assert.equal((await fetch(base + path, { headers: { authorization: `Bearer ${token(8)}` } })).status, 401);
      assert.equal((await fetch(base + path, { headers: { authorization: `Bearer ${token(99)}` } })).status, 401);
    }
    assert.equal((await fetch(`${base}/11`)).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.query = oldQuery;
    proposalService.getAllProposals = oldAll;
    proposalService.getProposalById = oldOne;
  }
});
