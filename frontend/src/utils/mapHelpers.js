import L from 'leaflet';
import { mapService } from '../services/api';

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

  // Standard patterns: @lat,lng ?q=lat,lng etc.
  const patterns = [
    /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /\/maps\/place\/[^/]*\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /\/maps\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /\/maps\?.*center=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /google\.com\/maps\?q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
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

  // Data parameters pattern: !3dlat!4dlng (from short URL redirects)
  const dataPattern = /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/;
  const dataMatch = trimmed.match(dataPattern);
  if (dataMatch) {
    const lat = parseFloat(dataMatch[1]);
    const lng = parseFloat(dataMatch[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // Short URL needs resolution
  if (trimmed.includes('maps.app.goo.gl') || trimmed.includes('goo.gl/maps')) {
    return { needResolve: true, url: trimmed };
  }

  return null;
};

export const resolveGoogleMapsShortUrl = async (url) => {
  try {
    const result = await mapService.resolveMapUrl(url);
    if (result.success && result.data) {
      return result.data;
    }
    return null;
  } catch (error) {
    console.error('Error resolving short URL:', error);
    return null;
  }
};
