import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { chargingStationService } from '../../services/api';
import { CHARGING_STATION_TASK_COUNTS_CHANGED_EVENT } from '../../utils/chargingStationTaskCounts';

export const CS_TASK_KEY = {
  'thong-tin-chung': 'overview',
  'khoi-tao-hop-dong': 'contract', 'xay-dung-ha-tang': 'infrastructure',
  'giao-tru': 'delivery', 'lap-tru': 'installation', 'nghiem-thu': 'acceptance', 'on-tram': 'on_station',
  finance: 'finance'
};

const ChargingStationNeedBadge = ({ stage }) => {
  const { token } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = () => chargingStationService.getTaskCounts(token).then((response) => {
      if (active) setCount(Number(response.data?.counts?.[CS_TASK_KEY[stage]] || 0));
    }).catch(() => {});
    refresh();
    window.addEventListener(CHARGING_STATION_TASK_COUNTS_CHANGED_EVENT, refresh);
    return () => { active = false; window.removeEventListener(CHARGING_STATION_TASK_COUNTS_CHANGED_EVENT, refresh); };
  }, [stage, token]);
  return count > 0 ? <span className="badge badge-sm badge-error ml-2">{count}</span> : null;
};

export default ChargingStationNeedBadge;
