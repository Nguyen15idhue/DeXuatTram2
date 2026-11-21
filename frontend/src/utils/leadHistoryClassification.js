import { getDataListLabelFromMap } from './dataListLabel';
import { normalizeLeadText } from './leadAccess';
import { findBaseField, resolveColumnDatalist } from './tableColumnSource';

const CLASSIFICATION_KEY = 'GDKV_phan_loai_KH';
const TIME_PATTERN = /^\d{4}-\d{2}-\d{2}[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/;

const parseJson = (value, description) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    console.error(`[leadHistoryClassification] ${description} không đúng định dạng JSON`);
    return null;
  }
};

const classificationValue = (row) => {
  const value = row?.[CLASSIFICATION_KEY];
  if (typeof value !== 'string') return '';
  return value.trim();
};

const historyTime = (value) => {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) return NaN;
  const date = value.slice(0, 10);
  const utc = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== date) return NaN;
  const normalized = value.replace(' ', 'T');
  return Date.parse(/[Zz]|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}+07:00`);
};

export const getLatestLeadHistoryClassification = (lead) => {
  const customData = parseJson(lead?.custom_data, 'custom_data');
  const rows = parseJson(lead?.tvbh_history ?? customData?.tvbh_history, 'tvbh_history');
  if (rows == null) return '';
  if (!Array.isArray(rows)) {
    console.error('[leadHistoryClassification] tvbh_history không phải mảng');
    return '';
  }
  let latest = null;
  let latestTime = -Infinity;
  let fallback = '';
  for (const row of rows) {
    const value = classificationValue(row);
    if (value) fallback = value;
    const time = historyTime(row?.thoi_gian);
    if (Number.isFinite(time) && time >= latestTime) {
      latest = row;
      latestTime = time;
    }
  }
  return latest ? classificationValue(latest) : fallback;
};

export const getLeadHistoryClassificationField = (fields) => {
  const history = fields.find((field) => field.key === 'tvbh_history');
  const config = parseJson(history?.source_config, 'cấu hình lịch sử tư vấn');
  const column = config?.columns?.find((item) => item.key === CLASSIFICATION_KEY);
  if (!column) return null;
  const base = findBaseField(column, fields);
  const options = parseJson(base ? base.options : column.options, 'tùy chọn phân loại');
  return {
    options: Array.isArray(options) ? options : [],
    ...resolveColumnDatalist(column, base),
  };
};

export const getLeadHistoryClassificationLabel = (value, field, dataListMaps) => {
  if (!value) return '—';
  const map = dataListMaps[field?.data_list_id];
  if (map && field.data_list_column) return getDataListLabelFromMap(map, field, value);
  const option = field?.options.find((item) => String(item?.value ?? item?.label ?? item) === value);
  return option && typeof option === 'object' ? String(option.label ?? option.value) : value;
};

export const getLeadHistoryClassificationStyle = (value, label) => {
  const priority = [value, label].map((item) => normalizeLeadText(String(item ?? '').replace(/_/g, ' ')))
    .map((item) => item.match(/^(ut1|ut2|ut3|kut)(?:\s|$)/)?.[1])
    .find(Boolean);
  const styles = {
    ut1: { backgroundColor: '#dcfce7', color: '#166534' },
    ut2: { backgroundColor: '#ffedd5', color: '#9a3412' },
    ut3: { backgroundColor: '#fef9c3', color: '#854d0e' },
    kut: { backgroundColor: '#e5e7eb', color: '#374151' },
  };
  return styles[priority] || { backgroundColor: '#e8e4cd', color: '#514b2a' };
};
