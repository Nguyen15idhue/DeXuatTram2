export const PROPOSAL_TASK_COUNTS_CHANGED_EVENT = 'proposal:task-counts-changed';

export const notifyProposalTaskCountsChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PROPOSAL_TASK_COUNTS_CHANGED_EVENT));
  }
};
