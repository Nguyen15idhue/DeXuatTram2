export const LEAD_TASK_COUNTS_CHANGED_EVENT = 'lead:task-counts-changed';

export const notifyLeadTaskCountsChanged = () => {
  window.dispatchEvent(new Event(LEAD_TASK_COUNTS_CHANGED_EVENT));
};
