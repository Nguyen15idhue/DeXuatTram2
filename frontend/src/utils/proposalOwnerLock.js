export const OWNER_DELETABLE_STATUSES = ['PENDING', 'REJECTED'];

export const canOwnerEditProposal = (proposal) => (
  proposal?.owner_update_request_open === true
  || Number(proposal?.owner_update_request_open) === 1
);

export const canOwnerDeleteProposal = (status) => OWNER_DELETABLE_STATUSES.includes(status);
