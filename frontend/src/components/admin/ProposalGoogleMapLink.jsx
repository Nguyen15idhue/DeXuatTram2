const GOOGLE_MAPS_HOSTS = new Set(['google.com', 'maps.app.goo.gl', 'goo.gl']);

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

const ProposalGoogleMapLink = ({ value, latitude, longitude }) => {
  const url = getGoogleMapsUrl(value) || buildCoordinatesUrl(latitude, longitude);
  if (!url) return <span className="whitespace-pre-wrap break-words">{value || '—'}</span>;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="link link-primary" aria-label="Mở vị trí đề xuất trên Google Maps">
      Mở Google Maps
    </a>
  );
};

export default ProposalGoogleMapLink;
