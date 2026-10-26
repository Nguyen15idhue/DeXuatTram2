import { getLegalDocFiles, formatProposalCost, formatProposalScale } from './proposalGrading';

export const REPORT_FIELD = 'file_bc_dx';
export const LAYOUT_FIELD = 'ban_ve_layout';

export const CREATING_STATUS = 'PROPOSAL_REPORT_CREATING';
export const RE_CREATING_STATUS = 'PROPOSAL_REPORT_RE_CREATING';
export const REVIEWING_STATUS = 'PROPOSAL_REPORT_REVIEWING';
export const UPDATING_STATUS = 'PROPOSAL_REPORT_UPDATING';

export const REPORT_UPLOAD_STATUSES = [CREATING_STATUS, RE_CREATING_STATUS, UPDATING_STATUS];

export const getReportFiles = (row) => getLegalDocFiles(row, REPORT_FIELD);

export const getLayoutFilesForReport = (row) => getLegalDocFiles(row, LAYOUT_FIELD);

export const canUploadReport = (row) => REPORT_UPLOAD_STATUSES.includes(row?.status);

export const uploadButtonLabel = (row) => (
  [RE_CREATING_STATUS, UPDATING_STATUS].includes(row?.status) ? 'Cập nhật lại' : 'Cập nhật'
);

export const getReportCost = (row) => formatProposalCost(row);

export const getReportScale = (row) => formatProposalScale(row);

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

export const formatCommittedPoles = (value) => {
  const rows = parseRows(value);
  if (rows.length === 0) return '-';
  return rows.map((row) => {
    const model = row.mo_hinh || '?';
    const quantity = Number(row.so_luong) || 0;
    const type = row.loai_tru || '?';
    const unitPrice = Number(row.gia_chot);
    return `${model} · ${quantity} × ${type}${Number.isFinite(unitPrice) ? ` (${unitPrice.toLocaleString('vi-VN')} ₫)` : ''}`;
  }).join(' + ');
};

export const formatCommittedTotal = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString('vi-VN')} ₫` : '-';
};
