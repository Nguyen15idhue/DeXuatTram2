import { useEffect, useState } from 'react';
import { loadMarkerIconConfig, MARKER_ICONS_REFRESH_EVENT } from '../utils/mapMarkerIcons';
import { getStationStatuses, getProposalStatuses } from '../utils/mapStatuses';

export default function useMapStatuses() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let mounted = true;
    loadMarkerIconConfig(true)
      .then(() => { if (mounted) setVersion((v) => v + 1); })
      .catch(() => {});
    const refresh = () => {
      loadMarkerIconConfig(true)
        .then(() => { if (mounted) setVersion((v) => v + 1); })
        .catch(() => {});
    };
    window.addEventListener(MARKER_ICONS_REFRESH_EVENT, refresh);
    return () => {
      mounted = false;
      window.removeEventListener(MARKER_ICONS_REFRESH_EVENT, refresh);
    };
  }, []);
  return {
    stationStatuses: getStationStatuses(),
    proposalStatuses: getProposalStatuses(),
    version
  };
}
