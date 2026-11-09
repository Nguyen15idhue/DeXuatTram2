const test = require('node:test');
const assert = require('node:assert/strict');
const deadlines = require('../src/services/businessDeadlineService');
const calendars = require('../src/services/businessCalendarService');

const calendar = {
  id: 7,
  timezone: 'Asia/Ho_Chi_Minh',
  weekly: Object.fromEntries(Array.from({ length: 7 }, (_, index) => [
    index + 1, index === 6 ? [] : [['07:30', '11:30'], ['13:00', '17:00']]
  ])),
  exceptions: { '2026-11-16': [] }
};
const executor = {
  query: async (sql, params) => {
    if (sql.includes('business_calendar_config') || Number(params?.[0]) === calendar.id) return [[calendar]];
    return [[]];
  }
};
const start = new Date('2026-11-14T16:30:00+07:00');
const disabled = { enabled: false, days: 0, hours: 0, minutes: 0 };
const config = (...rules) => ({ rules });
const iso = (value) => value.toISOString();

test('config duration keeps legacy wall-clock units separate from new work units', () => {
  const parts = { days: 3, hours: 2, minutes: 15 };
  assert.equal(deadlines.configMinutes(parts), 1575);
  assert.equal(deadlines.configMinutes(parts, 1440), 4455);
});

test('PENDING supplement falls back to three workdays without enabling transition', async () => {
  const result = await deadlines.getProposalDeadlineDates('PENDING', config({
    status: 'PENDING', supplement: disabled, transition: disabled
  }), executor, { start });
  assert.equal(result.calendarId, 7);
  assert.equal(result.transition, null);
  assert.equal(iso(result.supplement), iso(calendars.addWorkingDays(start, 3, calendar)));
  assert.equal(iso(result.supplement), '2026-11-19T09:30:00.000Z');
});

test('transition setup preserves disabled parts; disabled statuses require no calendar', async () => {
  const noQuery = { query: () => { throw new Error('must not fetch calendar'); } };
  assert.deepEqual(await deadlines.getProposalDeadlineDates('PENDING', config({
    status: 'PENDING', supplement: disabled, transition: disabled
  }), noQuery, { start, pendingSupplementFallback: false }), {
    supplement: null, transition: null, calendarId: null
  });
  assert.deepEqual(await deadlines.getProposalDeadlineDates('GRADING', config(), noQuery), {
    supplement: null, transition: null, calendarId: null
  });
});

test('both proposal clocks share one immutable calendar version and honor mixed units', async () => {
  const result = await deadlines.getProposalDeadlineDates('REVIEWING', config({
    status: 'REVIEWING',
    supplement: { enabled: true, days: 1, hours: 1, minutes: 15 },
    transition: { enabled: true, days: 2, hours: 0, minutes: 0 }
  }), executor, { start });
  assert.equal(result.calendarId, 7);
  assert.equal(iso(result.supplement), iso(calendars.addWorkingMinutes(start, 555, calendar)));
  assert.equal(iso(result.transition), iso(calendars.addWorkingMinutes(start, 960, calendar)));
});

test('new ON deadlines use fifteen workdays and extensions use the stored snapshot', async () => {
  const result = await deadlines.createDeadline({ days: 15 }, executor, start);
  assert.equal(result.calendarId, 7);
  assert.equal(iso(result.date), iso(calendars.addWorkingDays(start, 15, calendar)));
  const snapshotOnly = {
    query: async (sql, params) => {
      assert.equal(sql.includes('business_calendar_config'), false);
      assert.equal(Number(params[0]), 7);
      return [[calendar]];
    }
  };
  const extended = await deadlines.extendDeadline(result.date, { days: 3 }, 7, snapshotOnly);
  assert.equal(iso(extended), iso(calendars.addWorkingDays(result.date, 3, calendar)));
  assert.equal(await deadlines.extendDeadline(null, { days: 3 }, 7, snapshotOnly), null);
});

test('legacy extensions and warnings never look up or adopt a calendar', async () => {
  const noQuery = { query: () => { throw new Error('legacy must not query calendar'); } };
  const extended = await deadlines.extendDeadline(start, { days: 3, hours: 2 }, null, noQuery);
  assert.equal(extended.getTime() - start.getTime(), (3 * 24 + 2) * 3600000);
  assert.equal(await deadlines.remainingMinutes(start, extended, null, noQuery), (3 * 24 + 2) * 60);
});

test('new warnings count only work minutes through closed days and holidays', async () => {
  const end = new Date('2026-11-17T08:00:00+07:00');
  assert.equal(await deadlines.remainingMinutes(start, end, 7, executor), 60);
  assert.equal(await deadlines.remainingMinutes(start, end, null, executor), 3810);
});

test('new pause/resume excludes closed time, legacy pause retains elapsed wall time', async () => {
  const pausedAt = new Date('2026-11-14T17:00:00+07:00');
  const resumedAt = new Date('2026-11-17T07:30:00+07:00');
  const original = new Date('2026-11-18T11:00:00+07:00');
  assert.equal(iso(await deadlines.shiftPausedDeadline(original, pausedAt, resumedAt, 7, executor)), iso(original));
  const legacy = await deadlines.shiftPausedDeadline(original, pausedAt, resumedAt, null, executor);
  assert.equal(legacy.getTime() - original.getTime(), resumedAt.getTime() - pausedAt.getTime());
  const shifted = await deadlines.shiftPausedDeadline(
    original, resumedAt, new Date('2026-11-17T08:30:00+07:00'), 7, executor
  );
  assert.equal(iso(shifted), '2026-11-18T06:30:00.000Z');
});

test('calendar errors fail closed without wall-clock fallback', async () => {
  const broken = { query: async () => { throw new Error('calendar unavailable'); } };
  await assert.rejects(deadlines.createDeadline({ days: 15 }, broken, start), /calendar unavailable/);
  await assert.rejects(deadlines.getProposalDeadlineDates('PENDING', config(), broken, { start }), /calendar unavailable/);
  await assert.rejects(deadlines.extendDeadline(start, { days: 3 }, 7, broken), /calendar unavailable/);
  await assert.rejects(deadlines.extendDeadline(start, { days: 3 }, 99, executor), /lịch|calendar/i);
});
