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

const ProposalGoogleMapLink = ({ value }) => {
  const url = getGoogleMapsUrl(value);
  if (!url) return <span className="whitespace-pre-wrap break-words">{value || '—'}</span>;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="link link-primary">
      Mở Google Maps
    </a>
  );
};

export default ProposalGoogleMapLink;