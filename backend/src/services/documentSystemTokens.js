const SYSTEM_DATE_TOKENS = Object.freeze({
  today_day: 'Ngày hiện tại (giờ Việt Nam)',
  today_month: 'Tháng hiện tại (giờ Việt Nam)',
  today_year: 'Năm hiện tại (giờ Việt Nam)'
});

const getSystemDateTokens = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    today_day: String(Number(values.day)),
    today_month: String(Number(values.month)),
    today_year: values.year
  };
};

module.exports = { SYSTEM_DATE_TOKENS, getSystemDateTokens };
