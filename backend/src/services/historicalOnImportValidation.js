const fail = message => Object.assign(new Error(message), { statusCode: 400 });
const empty = value => value === undefined || value === null || String(value).trim() === '';
const text = value => String(value ?? '').trim();
const canonical = value => text(value).toLocaleLowerCase('vi-VN');
const PROPOSAL_STATUSES = {
  'Đã duyệt BCĐX': 'APPROVED', 'Đang triển khai': 'DEPLOYING', 'Hoạt động': 'ACTIVE',
  'Đã hủy': 'CANCELLED', 'Đã lưu trữ': 'ARCHIVED'
};
const STATION_STATUSES = {
  'Hợp đồng và hạ tầng': 'ONBOARDING', 'Giao trụ': 'DELIVERING', 'Lắp trụ': 'INSTALLING',
  'Nghiệm thu': 'ACCEPTANCE', 'Cấu hình': 'CONFIGURING', 'Hoạt động': 'OPERATING', 'Đã hủy': 'CANCELLED'
};

const dateValue = (value, label) => {
  if (empty(value)) return null;
  const source = text(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(source);
  const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(source);
  if (!iso && !local) throw fail(`${label}: ngày phải có dạng DD/MM/YYYY hoặc YYYY-MM-DD`);
  const year = iso ? iso[1] : local[3];
  const month = iso ? iso[2] : local[2];
  const day = iso ? iso[3] : local[1];
  const result = `${year}-${month}-${day}`;
  const date = new Date(`${result}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== result || result < '1900-01-01') {
    throw fail(`${label}: ngày không hợp lệ`);
  }
  return result;
};

const amountValue = value => {
  if (empty(value)) return null;
  const source = text(value).replace(/\s*(?:đ|₫|VND)$/i, '').trim();
  let normalized = source;
  if (typeof value !== 'number') {
    if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(source)) normalized = source.replace(/\./g, '').replace(',', '.');
    else if (/^\d+(?:,\d{1,2})?$/.test(source)) normalized = source.replace(',', '.');
    else if (!/^\d+(?:\.\d{1,2})?$/.test(source)) throw fail('Giá trị hợp đồng không hợp lệ');
  }
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0 || !Number.isSafeInteger(Math.round(number * 100))
    || Math.abs(number * 100 - Math.round(number * 100)) > 0.001) throw fail('Giá trị hợp đồng không hợp lệ');
  return number;
};

const validateRecord = (record, { creating = false } = {}) => {
  const result = { ...record };
  if (!text(result.legacy_code)) throw fail('Mã BCĐX là bắt buộc');
  if (!empty(result.existing_proposal_id) && (!/^[1-9]\d*$/.test(text(result.existing_proposal_id))
    || !Number.isSafeInteger(Number(result.existing_proposal_id)))) throw fail('ID đề xuất không hợp lệ');
  if (!empty(result.owner_user_id) && (!/^[1-9]\d*$/.test(text(result.owner_user_id))
    || !Number.isSafeInteger(Number(result.owner_user_id)))) throw fail('ID người đề xuất không hợp lệ');
  for (const [key, label] of [['owner_name', 'Tên chủ đầu tư'], ['owner_phone', 'SĐT liên hệ'],
    ['address', 'Địa chỉ'], ['province', 'Tỉnh thành'], ['latitude', 'Vĩ độ'], ['longitude', 'Kinh độ'],
    ['model', 'Mô hình đầu tư']]) {
    if (creating && empty(result[key])) throw fail(`${label} là bắt buộc khi tạo mới`);
  }
  if (!empty(result.owner_phone) && !/^\d{10,11}$/.test(text(result.owner_phone))) {
    throw fail('SĐT liên hệ phải có 10 hoặc 11 chữ số');
  }
  for (const [key, limit, label] of [['latitude', 90, 'Vĩ độ'], ['longitude', 180, 'Kinh độ']]) {
    if (!empty(result[key])) {
      const value = Number(result[key]);
      if (!Number.isFinite(value) || Math.abs(value) > limit) throw fail(`${label} không hợp lệ`);
      result[key] = value;
    }
  }
  for (const [key, label] of [['contract_date', 'Ngày ký hợp đồng'], ['delivery_date', 'Ngày giao trụ'], ['on_date', 'Ngày ON']]) {
    result[key] = dateValue(result[key], label);
  }
  if (result.cancel_kind === 'Hủy BCĐX' && !empty(result.proposal_status)
    && result.proposal_status !== 'Đã hủy') {
    throw fail('Hủy BCĐX phải có trạng thái đề xuất Đã hủy');
  }
  if (result.cancel_kind === 'Hủy ON trạm' && !empty(result.proposal_status)
    && result.proposal_status !== 'Đã lưu trữ') {
    throw fail('Hủy ON trạm phải có trạng thái đề xuất Đã lưu trữ');
  }
  if (!empty(result.cancel_kind) && !empty(result.on_status) && result.on_status !== 'Đã hủy') {
    throw fail('Hồ sơ đã hủy phải có trạng thái ON trạm Đã hủy');
  }
  result.contract_amount = amountValue(result.contract_amount);
  if (!Array.isArray(result.poles)) throw fail('Danh sách trụ không hợp lệ');
  const seen = new Set();
  for (const pole of result.poles) {
    const key = `${text(pole.model).toLowerCase()}:${text(pole.name).toLocaleLowerCase('vi-VN')}`;
    if (seen.has(key)) throw fail('Loại trụ và mô hình bị lặp trong cùng dòng');
    seen.add(key);
    if (!empty(result.model) && (result.model === 'NQ_LK'
      ? !['NQ', 'LK'].includes(pole.model) : pole.model !== result.model)) {
      throw fail('Mô hình trụ không khớp mô hình đề xuất');
    }
  }
  if (creating && (!result.poles.some(pole => pole.proposed > 0) || !result.poles.some(pole => pole.committed > 0))) {
    throw fail('Cần nhập quy mô trụ đề xuất và quy mô trụ chốt khi tạo mới');
  }
  if (creating && result.model === 'NQ_LK' && ['NQ', 'LK'].some(model =>
    !result.poles.some(pole => pole.model === model && pole.proposed > 0)
    || !result.poles.some(pole => pole.model === model && pole.committed > 0))) {
    throw fail('Mô hình NQ_LK cần quy mô đề xuất và trụ chốt cho cả NQ và LK');
  }
  return result;
};

const validateExistingRecord = (record, snapshot) => {
  if (!snapshot?.proposal) return;
  const proposal = snapshot.proposal;
  const custom = typeof proposal.custom_data === 'string' ? JSON.parse(proposal.custom_data) : proposal.custom_data || {};
  for (const [field, key, label] of [['model', 'mo_hinh_dau_tu', 'mô hình'], ['province', 'province', 'tỉnh thành']]) {
    if (!empty(record[field]) && canonical(record[field]) !== canonical(custom[key])) {
      throw fail(`Không thể thay đổi ${label} của đề xuất hiện có qua import; cần cập nhật theo quy trình hiện hành`);
    }
  }
  const proposalStatus = PROPOSAL_STATUSES[record.proposal_status]
    || (record.cancel_kind === 'Hủy BCĐX' ? 'CANCELLED' : record.cancel_kind === 'Hủy ON trạm' ? 'ARCHIVED' : proposal.status);
  if (proposalStatus !== proposal.status) {
    throw fail('Không thể đổi trạng thái đề xuất hiện có qua import; cần thực hiện theo quy trình hiện hành');
  }
  const stationStatus = STATION_STATUSES[record.on_status] || (record.cancel_kind ? 'CANCELLED' : snapshot.station?.status);
  if (snapshot.station && stationStatus !== snapshot.station.status) {
    throw fail('Không thể đổi trạng thái ON trạm hiện có qua import; cần thực hiện theo quy trình hiện hành');
  }
};

module.exports = { validateRecord, validateExistingRecord, dateValue, amountValue };
