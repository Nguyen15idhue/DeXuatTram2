const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateCalendar, canManageCalendar, getCalendar, getCalendarById,
  addWorkingMinutes, addWorkingDays, workingMinutesBetween, MAX_TRAVERSAL_DAYS
} = require('../src/services/businessCalendarService');

function calendar(exceptions = {}) {
  return {
    id: 1,
    timezone: 'Asia/Ho_Chi_Minh',
    weekly: Object.fromEntries(Array.from({ length: 7 }, (_, index) => [index + 1,
      index === 6 ? [] : [['07:30', '11:30'], ['13:00', '17:00']]])),
    exceptions
  };
}
const iso = value => value.toISOString();

test('UTC+7 arithmetic does not depend on host timezone; a working day is 480 minutes', () => {
  assert.equal(iso(addWorkingDays('2026-11-09T07:30:00+07:00', 1, calendar())), '2026-11-09T10:00:00.000Z');
  assert.equal(workingMinutesBetween('2026-11-09T00:30:00Z', '2026-11-09T10:00:00Z', calendar()), 480);
});

test('split shifts skip lunch, before opening, and after closing', () => {
  assert.equal(iso(addWorkingMinutes('2026-11-09T11:00:00+07:00', 60, calendar())), '2026-11-09T06:30:00.000Z');
  assert.equal(iso(addWorkingMinutes('2026-11-09T12:00:00+07:00', 30, calendar())), '2026-11-09T06:30:00.000Z');
  assert.equal(iso(addWorkingMinutes('2026-11-09T06:00:00+07:00', 30, calendar())), '2026-11-09T01:00:00.000Z');
  assert.equal(iso(addWorkingMinutes('2026-11-09T17:00:00+07:00', 30, calendar())), '2026-11-10T01:00:00.000Z');
});

test('Saturday works, Sunday is off, and UTC date boundaries resolve to local dates', () => {
  assert.equal(iso(addWorkingMinutes('2026-11-14T16:30:00+07:00', 60, calendar())), '2026-11-16T01:00:00.000Z');
  assert.equal(iso(addWorkingMinutes('2026-11-15T20:00:00Z', 30, calendar())), '2026-11-16T01:00:00.000Z');
  assert.equal(workingMinutesBetween('2026-11-15T00:00:00+07:00', '2026-11-16T00:00:00+07:00', calendar()), 0);
});

test('holiday and special Sunday working windows replace the weekly schedule', () => {
  const config = calendar({ '2026-11-16': [], '2026-11-15': [['09:00', '10:00']] });
  assert.equal(iso(addWorkingMinutes('2026-11-14T17:00:00+07:00', 90, config)), '2026-11-17T01:00:00.000Z');
  assert.equal(workingMinutesBetween('2026-11-15T00:00:00+07:00', '2026-11-17T00:00:00+07:00', config), 60);
});

test('between returns signed fractional minutes; zero additions preserve exact instant', () => {
  const from = '2026-11-09T11:29:30+07:00';
  const to = '2026-11-09T13:00:30+07:00';
  assert.equal(workingMinutesBetween(from, to, calendar()), 1);
  assert.equal(workingMinutesBetween(to, from, calendar()), -1);
  assert.equal(workingMinutesBetween(from, from, calendar()), 0);
  assert.equal(iso(addWorkingMinutes(from, 0, calendar())), '2026-11-09T04:29:30.000Z');
  assert.equal(iso(addWorkingMinutes(from, 1, calendar())), '2026-11-09T06:00:30.000Z');
  assert.equal(iso(addWorkingMinutes(new Date(from), 0.5, calendar())), '2026-11-09T04:30:00.000Z');
});

test('year boundaries and leap dates are handled exactly', () => {
  const config = calendar({ '2028-02-29': [] });
  assert.equal(iso(addWorkingMinutes('2028-02-28T17:00:00+07:00', 30, config)), '2028-03-01T01:00:00.000Z');
  assert.equal(iso(addWorkingMinutes('2026-12-31T17:00:00+07:00', 30, calendar())), '2027-01-01T01:00:00.000Z');
});

test('invalid durations and ambiguous/invalid dates fail explicitly', () => {
  for (const value of [-1, NaN, Infinity, '30', null]) {
    assert.throws(() => addWorkingMinutes(new Date(), value, calendar()), /phút/);
    assert.throws(() => addWorkingDays(new Date(), value, calendar()), /ngày/);
  }
  for (const value of ['2026-11-09', '2026-11-09T07:30:00', '2026-02-30T00:00:00Z', new Date(NaN), null, Infinity]) {
    assert.throws(() => addWorkingMinutes(value, 1, calendar()));
    assert.throws(() => workingMinutesBetween(value, new Date(), calendar()));
  }
});

test('validation rejects overlap, empty week, bad clock ranges, malformed dates and timezone', () => {
  const overlap = calendar();
  overlap.weekly[1] = [['07:30', '11:30'], ['11:00', '13:00']];
  assert.throws(() => validateCalendar(overlap), /chồng lấn/);
  for (const windows of [[['17:00', '07:30']], [['24:00', '25:00']], [['7:30', '11:30']], [['07:30']], 'off']) {
    const config = calendar();
    config.weekly[1] = windows;
    assert.throws(() => validateCalendar(config));
  }
  const empty = calendar();
  Object.keys(empty.weekly).forEach(key => { empty.weekly[key] = []; });
  assert.throws(() => validateCalendar(empty), /ít nhất/);
  const missing = calendar();
  delete missing.weekly[7];
  assert.throws(() => validateCalendar(missing), /đủ/);
  for (const date of ['2026-02-29', '2026-04-31', '2026-1-01', '2026-13-01']) {
    assert.throws(() => validateCalendar(calendar({ [date]: [] })), /Ngày ngoại lệ/);
  }
  assert.throws(() => validateCalendar({ ...calendar(), timezone: 'UTC' }), /Múi giờ/);
  assert.throws(() => validateCalendar(calendar({ '2026-11-09': [['10:00', '09:00']] })));
});

test('normalization sorts windows, accepts adjacent shifts, and does not mutate snapshots', () => {
  const config = calendar();
  config.weekly[1] = [['13:00', '17:00'], ['11:30', '13:00'], ['07:30', '11:30']];
  const original = JSON.stringify(config);
  assert.deepEqual(validateCalendar(config).weekly[1], [['07:30', '11:30'], ['11:30', '13:00'], ['13:00', '17:00']]);
  addWorkingMinutes('2026-11-09T07:30:00+07:00', 1, config);
  assert.equal(JSON.stringify(config), original);
});

test('traversal is bounded with explicit errors, never a wall-clock fallback', () => {
  assert.throws(() => addWorkingMinutes('2026-11-09T00:00:00Z', MAX_TRAVERSAL_DAYS * 1440, calendar()), /giới hạn duyệt/);
  assert.throws(() => workingMinutesBetween('2026-11-09T00:00:00Z', '2200-11-09T00:00:00Z', calendar()), /giới hạn duyệt/);
});

test('only Super Admin or accent/case/spacing-normalized Back Office can manage', () => {
  assert.equal(canManageCalendar({ role: 'SUPER_ADMIN' }), true);
  assert.equal(canManageCalendar({ role: 'SALES', custom_data: '{"department":"Phòng BẮCK OFFICE"}' }), true);
  assert.equal(canManageCalendar({ role: 'ADMIN', custom_data: { department: 'BackOffice' } }), true);
  for (const user of [null, {}, { role: 'ADMIN' }, { role: 'SALES', custom_data: 'bad json' }, { custom_data: { department: 'Kế toán' } }]) {
    assert.equal(canManageCalendar(user), false);
  }
});

test('database reads preserve immutable IDs, propagate failures, and never fabricate defaults', async () => {
  const old = calendar();
  const executor = { query: async () => [[{ ...old, weekly: JSON.stringify(old.weekly), exceptions: '{}' }]] };
  assert.deepEqual(await getCalendar(executor), old);
  assert.deepEqual(await getCalendarById(1, executor), old);
  await assert.rejects(getCalendar({ query: async () => [[]] }), /migration 222/);
  await assert.rejects(getCalendarById(3, { query: async () => [[]] }), /Không tìm thấy/);
  await assert.rejects(getCalendar({ query: async () => { throw new Error('DB unavailable'); } }), /DB unavailable/);
  await assert.rejects(getCalendarById('1 OR 1=1', executor), /không hợp lệ/);
});

test('saving locks singleton, inserts a new snapshot, switches pointer and commits', async t => {
  const service = require('../src/services/businessCalendarService');
  const pool = require('../src/utils/db');
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('FOR UPDATE')) return [[{ active_version_id: 1 }]];
      if (sql.startsWith('INSERT')) return [{ insertId: 2 }];
      return [{}];
    },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release')
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  const result = await service.saveCalendar(calendar(), 42);
  assert.equal(result.id, 2);
  assert.equal(calls[0], 'begin');
  assert.match(calls[1].sql, /FOR UPDATE/);
  assert.match(calls[2].sql, /^INSERT INTO business_calendar_versions/);
  assert.equal(calls[2].params[3], 42);
  assert.match(calls[3].sql, /^UPDATE business_calendar_config/);
  assert.deepEqual(calls[3].params, [2]);
  assert.deepEqual(calls.slice(-2), ['commit', 'release']);
});

test('saving stale snapshots or DB failures rolls back without activating a version', async t => {
  const service = require('../src/services/businessCalendarService');
  const pool = require('../src/utils/db');
  let queries = 0;
  const calls = [];
  const connection = {
    beginTransaction: async () => {},
    query: async () => { queries++; return [[{ active_version_id: 2 }]]; },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release')
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  await assert.rejects(service.saveCalendar(calendar(), 42), error => error.status === 409);
  assert.equal(queries, 1);
  assert.deepEqual(calls, ['rollback', 'release']);
  connection.query = async () => { throw new Error('DB unavailable'); };
  await assert.rejects(service.saveCalendar(calendar(), 42), /DB unavailable/);
  assert.deepEqual(calls, ['rollback', 'release', 'rollback', 'release']);
});

test('routes authorize against fresh DB custom_data, not auth role or absent JWT custom_data', async t => {
  const Module = require('node:module');
  const { sep } = require('node:path');
  const express = require('express');
  const service = require('../src/services/businessCalendarService');
  let currentUser = { id: 42, role: 'SALES', status: 'ACTIVE', custom_data: '{}' };
  const fakePool = { query: async sql => {
    assert.match(sql, /custom_data FROM users/);
    return [[currentUser]];
  } };
  const originalLoad = Module._load;
  t.mock.method(Module, '_load', function (request, parent, ...args) {
    if (parent?.filename.endsWith(`${sep}routes${sep}businessCalendar.js`)) {
      if (request === '../utils/db') return fakePool;
      if (request === '../middlewares/auth') return { requireAuth: (req, res, next) => {
        req.user = { id: 42, role: 'SUPER_ADMIN' };
        next();
      } };
    }
    return originalLoad.call(this, request, parent, ...args);
  });
  t.mock.method(service, 'getCalendar', async () => calendar());
  t.mock.method(service, 'saveCalendar', async (input, actorId) => {
    assert.equal(actorId, 42);
    return { ...input, id: 2 };
  });
  t.mock.method(console, 'info', () => {});
  const app = express();
  app.use(express.json());
  const routePath = require.resolve('../src/routes/businessCalendar');
  delete require.cache[routePath];
  app.use('/api/admin/business-calendar', require(routePath));
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/admin/business-calendar`;
    const get = await (await fetch(url)).json();
    assert.equal(get.success, true);
    assert.equal(get.meta.can_manage, false);
    const denied = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(calendar()) });
    assert.equal(denied.status, 403);
    currentUser = { ...currentUser, custom_data: '{"department":"Phòng BẮCK OFFICE"}' };
    const allowed = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(calendar()) });
    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json()).data.id, 2);
    assert.equal((await (await fetch(url)).json()).meta.can_manage, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
    delete require.cache[routePath];
  }
});
