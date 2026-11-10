const pool = { query: (...args) => require('../utils/db').query(...args) };
const calendars = require('./businessCalendarService');

const configMinutes = (part = {}, minutesPerDay = 480) =>
  (Number(part.days) || 0) * minutesPerDay
  + (Number(part.hours) || 0) * 60 + (Number(part.minutes) || 0);

const calendarFor = async (id, executor = pool) => {
  const calendar = id == null
    ? await calendars.getCalendar(executor)
    : await calendars.getCalendarById(id, executor);
  if (!calendar || !calendar.id) throw new Error(`Business calendar not found: ${id ?? 'active'}`);
  return calendar;
};

const getProposalDeadlineDates = async (status, config, executor = pool, {
  start = new Date(), pendingSupplementFallback = true
} = {}) => {
  const rule = config.rules.find((item) => item.status === status);
  const minutesFor = (kind) => {
    const part = rule?.[kind];
    return part?.enabled ? Math.max(0, configMinutes(part)) : 0;
  };
  const supplementMinutes = minutesFor('supplement')
    || (status === 'PENDING' && pendingSupplementFallback ? 3 * 480 : 0);
  const transitionMinutes = minutesFor('transition');
  if (!supplementMinutes && !transitionMinutes) {
    return { supplement: null, transition: null, calendarId: null };
  }
  const calendar = await calendarFor(null, executor);
  return {
    supplement: supplementMinutes ? calendars.addWorkingMinutes(new Date(start), supplementMinutes, calendar) : null,
    transition: transitionMinutes ? calendars.addWorkingMinutes(new Date(start), transitionMinutes, calendar) : null,
    calendarId: calendar.id
  };
};

const extendDeadline = async (date, parts, calendarId, executor = pool) => {
  if (!date) return null;
  if (calendarId == null) {
    return new Date(new Date(date).getTime() + configMinutes(parts, 1440) * 60000);
  }
  const calendar = await calendarFor(calendarId, executor);
  return calendars.addWorkingMinutes(new Date(date), configMinutes(parts), calendar);
};

const createDeadline = async (parts, executor = pool, start = new Date()) => {
  const calendar = await calendarFor(null, executor);
  return {
    date: calendars.addWorkingMinutes(new Date(start), configMinutes(parts), calendar),
    calendarId: calendar.id
  };
};

const shiftPausedDeadline = async (date, pausedAt, resumedAt, calendarId, executor = pool) => {
  if (!date) return null;
  if (calendarId == null) {
    return new Date(new Date(date).getTime()
      + Math.max(0, new Date(resumedAt).getTime() - new Date(pausedAt).getTime()));
  }
  const calendar = await calendarFor(calendarId, executor);
  const elapsed = Math.max(0, calendars.workingMinutesBetween(new Date(pausedAt), new Date(resumedAt), calendar));
  return elapsed > 0 ? calendars.addWorkingMinutes(new Date(date), elapsed, calendar) : new Date(date);
};

const remainingMinutes = async (start, end, calendarId, executor = pool) => {
  if (calendarId == null) return (new Date(end).getTime() - new Date(start).getTime()) / 60000;
  return calendars.workingMinutesBetween(new Date(start), new Date(end), await calendarFor(calendarId, executor));
};

module.exports = {
  configMinutes, calendarFor, createDeadline, getProposalDeadlineDates, extendDeadline,
  shiftPausedDeadline, remainingMinutes
};
