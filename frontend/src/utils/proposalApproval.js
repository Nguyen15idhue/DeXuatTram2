import { getLegalDocFiles, formatProposalCost, formatProposalScale } from './proposalGrading';

export const REPORT_FIELD = 'file_bc_dx';
export const LAYOUT_FIELD = 'ban_ve_layout';

export const REVIEWING_STATUS = 'PROPOSAL_REPORT_REVIEWING';
export const UPDATING_STATUS = 'PROPOSAL_REPORT_UPDATING';
export const SIGNATURE_STATUS = 'SIGNATURE_PENDING';
export const APPROVED_STATUS = 'APPROVED';

export const getReportFiles = (row) => getLegalDocFiles(row, REPORT_FIELD);

export const getLayoutFilesForApproval = (row) => getLegalDocFiles(row, LAYOUT_FIELD);

export const canRequestUpdate = (row) => row?.status === REVIEWING_STATUS;

export const canConfigureSignature = (row) => row?.status === REVIEWING_STATUS;

export const getApprovalCost = (row) => formatProposalCost(row);

export const getApprovalScale = (row) => formatProposalScale(row);

export const DEFAULT_SIGNER_BOX = {
  page: 1,
  pos_x: 0.35,
  pos_y: 0.72,
  box_width: 0.25,
  box_height: 0.1697
};
