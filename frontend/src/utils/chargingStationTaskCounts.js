export const CHARGING_STATION_TASK_COUNTS_CHANGED_EVENT = 'charging-station:task-counts-changed';

export const notifyChargingStationTaskCountsChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CHARGING_STATION_TASK_COUNTS_CHANGED_EVENT));
  }
};
