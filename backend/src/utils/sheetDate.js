const actualOnDateSerial = (value, proposalId) => {
  if (value === null || value === undefined || value === '') return '';
  let date;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(value);
  } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(value)) {
    date = value.slice(0, 10);
  }
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!date || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    throw new Error(`Đề xuất ${proposalId}: ngày ON thực tế không hợp lệ`);
  }
  return (timestamp - Date.UTC(1899, 11, 30)) / 86400000;
};

module.exports = { actualOnDateSerial };
