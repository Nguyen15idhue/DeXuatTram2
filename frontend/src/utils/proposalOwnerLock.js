export const OWNER_DELETABLE_STATUSES = ['PENDING', 'REJECTED'];

export const OWNER_EDITABLE_STATUSES = [
  'PENDING',
  'REJECTED',
  'REVIEWING',
  'PRINCIPLE_APPROVED',
  'INFOR_WAITING',
  'PROPOSAL_REPORT_UPDATING',
  'PROPOSAL_REPORT_RE_CREATING'
];

export const canOwnerEditProposal = (proposal) => {
  if (!proposal) return false;
  const status = proposal.status;
  if (OWNER_EDITABLE_STATUSES.includes(status)) return true;
  // Reopen-info flow: owner can edit when an update request is open
  return proposal?.owner_update_request_open === true
    || Number(proposal?.owner_update_request_open) === 1;
};

export const canOwnerDeleteProposal = (status) => OWNER_DELETABLE_STATUSES.includes(status);
