import L from 'leaflet';

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

export const parseGoogleMapsLink = (url) => {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();

  const patterns = [
    /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /\/maps\/place\/[^/]*\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /\/maps\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /\/maps\?.*center=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /google\.com\/maps\?q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /maps\.app\.goo\.gl/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      if (match[1] && match[2]) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { lat, lng };
        }
      }
    }
  }

  if (trimmed.includes('maps.app.goo.gl') || trimmed.includes('goo.gl/maps')) {
    return { needResolve: true, url: trimmed };
  }

  return null;
};

export const resolveGoogleMapsShortUrl = async (url) => {
  try {
    const response = await fetch(url, { redirect: 'follow' });
    const finalUrl = response.url;
    return parseGoogleMapsLink(finalUrl);
  } catch (error) {
    console.error('Error resolving short URL:', error);
    return null;
  }
};
