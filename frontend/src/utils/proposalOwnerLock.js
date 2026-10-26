export const OWNER_EDITABLE_STATUSES = [
  'PENDING',
  'REJECTED',
  'REVIEWING',
  'PRINCIPLE_APPROVED',
  'INFOR_WAITING',
  'PROPOSAL_REPORT_UPDATING',
  'PROPOSAL_REPORT_RE_CREATING'
];

export const OWNER_DELETABLE_STATUSES = ['PENDING', 'REJECTED'];

export const canOwnerEditProposal = (status) => OWNER_EDITABLE_STATUSES.includes(status);

export const canOwnerDeleteProposal = (status) => OWNER_DELETABLE_STATUSES.includes(status);
