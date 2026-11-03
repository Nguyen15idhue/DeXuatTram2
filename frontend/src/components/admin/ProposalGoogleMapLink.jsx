import { getFieldValue } from '../../utils/proposalGrading';

const GOOGLE_MAPS_HOSTS = new Set(['google.com', 'maps.app.goo.gl', 'goo.gl']);

const GOOGLE_MAP_LINK_KEYS = ['link_google_map', 'link_gg_map'];

const getGoogleMapsUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    const isGoogleMapsHost = GOOGLE_MAPS_HOSTS.has(hostname) || hostname.endsWith('.google.com');
    return url.protocol === 'https:' && isGoogleMapsHost ? url.href : null;
  } catch {
    return null;
  }
};

const buildCoordinatesUrl = (latitude, longitude) => {
  if (latitude === null || latitude === undefined || String(latitude).trim() === ''
    || longitude === null || longitude === undefined || String(longitude).trim() === '') return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const query = new URLSearchParams({ api: '1', query: `${lat},${lng}` });
  return `https://www.google.com/maps/search/?${query.toString()}`;
};

export const buildGoogleMapsHref = (proposal) => {
  if (!proposal) return null;
  const linkValue = getFieldValue(proposal, GOOGLE_MAP_LINK_KEYS[0]) || getFieldValue(proposal, GOOGLE_MAP_LINK_KEYS[1]);
  return getGoogleMapsUrl(linkValue) || buildCoordinatesUrl(proposal.latitude, proposal.longitude);
};

const ProposalGoogleMapLink = ({ proposal, value, latitude, longitude }) => {
  const parsedLatitude = proposal?.latitude ?? latitude;
  const parsedLongitude = proposal?.longitude ?? longitude;
  const linkValue = proposal
    ? (getFieldValue(proposal, GOOGLE_MAP_LINK_KEYS[0]) || getFieldValue(proposal, GOOGLE_MAP_LINK_KEYS[1]) || value)
    : value;
  const url = getGoogleMapsUrl(linkValue) || buildCoordinatesUrl(parsedLatitude, parsedLongitude);
  if (!url) return <span className="whitespace-pre-wrap break-words">{linkValue || '—'}</span>;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="link link-primary" aria-label="Mở vị trí đề xuất trên Google Maps">
      Mở Google Maps
    </a>
  );
};

export default ProposalGoogleMapLink;
