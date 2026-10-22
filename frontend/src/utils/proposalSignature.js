import { formatProposalScale } from './proposalGrading';

export const SIGN_STATUS = {
  PENDING: 'PENDING',
  DOING: 'DOING',
  DONE: 'DONE',
  CEO_SIGNED: 'CEO_SIGNED'
};

export const SIGN_STATUS_LABELS = {
  PENDING: 'Cần thực hiện',
  DOING: 'Đang thực hiện',
  DONE: 'Đã hoàn thành',
  CEO_SIGNED: 'Chủ tịch đã phê duyệt'
};

export const SIGN_STATUS_COLORS = {
  PENDING: '#f59e0b',
  DOING: '#3b82f6',
  DONE: '#22c55e',
  CEO_SIGNED: '#16a34a'
};

export const SIGN_STATUS_HINTS = {
  PENDING: 'Chưa có bất kỳ ai ký',
  DOING: 'Đã có ít nhất một người ký',
  DONE: 'Tất cả đã ký, chờ trình chủ tịch ký',
  CEO_SIGNED: 'Đã tải lên file BCĐX chốt khi chủ tịch ký'
};

export const getSignStatusLabel = (code) => SIGN_STATUS_LABELS[code] || '—';

export const getSignStatusColor = (code) => SIGN_STATUS_COLORS[code] || '#64748b';

const parseRows = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const formatChotTruRows = (value) => {
  const rows = parseRows(value);
  if (rows.length === 0) return '-';
  return rows.map((row) => {
    const model = row.mo_hinh || '?';
    const quantity = Number(row.so_luong) || 0;
    const type = row.loai_tru || '?';
    return `${model} · ${quantity} × ${type}`;
  }).join(' + ');
};

export const formatChotTotal = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString('vi-VN')} ₫` : '-';
};

export const formatProposedScale = (row) => formatProposalScale(row);

export const formatSignedTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('vi-VN', { hour12: false });
};
