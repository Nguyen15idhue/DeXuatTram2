export const RETIRED_PROPOSAL_STATUS = 'PRINCIPLE_APPROVED';

export const isRetiredProposalStatusOption = (entity, key, value) => (
  entity === 'station_proposals'
  && key === 'status'
  && value === RETIRED_PROPOSAL_STATUS
);
