export const MARKER_COLORS = {
  ACTIVE: '#22c55e',
  DEPLOYING: '#eab308',
  PENDING: '#f97316',
  REVIEWING: '#3b82f6',
  APPROVED: '#22c55e',
  REJECTED: '#ef4444'
};

export const getMarkerColor = (status) => {
  return MARKER_COLORS[status] || '#6b7280';
};

export const createCustomIcon = (color) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width: 24px;
      height: 24px;
      background-color: ${color};
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
  });
};
