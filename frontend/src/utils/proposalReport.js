import { getLegalDocFiles, formatProposalCost, formatProposalScale } from './proposalGrading';

export const REPORT_FIELD = 'file_bc_dx';
export const LAYOUT_FIELD = 'ban_ve_layout';

export const CREATING_STATUS = 'PROPOSAL_REPORT_CREATING';
export const RE_CREATING_STATUS = 'PROPOSAL_REPORT_RE_CREATING';
export const REVIEWING_STATUS = 'PROPOSAL_REPORT_REVIEWING';

export const REPORT_UPLOAD_STATUSES = [CREATING_STATUS, RE_CREATING_STATUS];

export const getReportFiles = (row) => getLegalDocFiles(row, REPORT_FIELD);

export const getLayoutFilesForReport = (row) => getLegalDocFiles(row, LAYOUT_FIELD);

export const canUploadReport = (row) => REPORT_UPLOAD_STATUSES.includes(row?.status);

export const uploadButtonLabel = (row) => (row?.status === RE_CREATING_STATUS ? 'Cập nhật lại' : 'Cập nhật');

export const getReportCost = (row) => formatProposalCost(row);

export const getReportScale = (row) => formatProposalScale(row);
