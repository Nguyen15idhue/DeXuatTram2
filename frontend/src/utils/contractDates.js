const parseDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || year > 9999 || month < 1 || month > 12) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= lastDay ? { year, month, day } : null;
};

export const calculateContractExpiry = (effectiveDate, years) => {
  const date = parseDate(effectiveDate);
  if (!date || !/^[1-9]\d*$/.test(String(years))) return '';
  const term = Number(years);
  const year = date.year + term;
  if (!Number.isSafeInteger(term) || year > 9999) return '';
  const day = Math.min(date.day, new Date(Date.UTC(year, date.month, 0)).getUTCDate());
  return `${year}-${String(date.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const calculateExpectedOnDate = (effectiveDate, days) => {
  const date = parseDate(effectiveDate);
  if (!date || !/^\d+$/.test(String(days))) return '';
  const count = Number(days);
  if (!Number.isSafeInteger(count)) return '';
  const expected = new Date(Date.UTC(date.year, date.month - 1, date.day) + count * 86400000);
  if (Number.isNaN(expected.getTime()) || expected.getUTCFullYear() > 9999) return '';
  return expected.toISOString().slice(0, 10);
};

export const getContractTermYears = (effectiveDate, expiryDate) => {
  const start = parseDate(effectiveDate);
  const end = parseDate(expiryDate);
  if (!start || !end) return '';
  const years = end.year - start.year;
  return years > 0 && calculateContractExpiry(effectiveDate, years) === expiryDate ? String(years) : '';
};
