export function formatDistanceM(m) {
  const n = Number(m);
  if (!Number.isFinite(n)) return '';
  if (Math.abs(n) < 1000) return `${Math.round(n)} m`;
  return `${(n / 1000).toFixed(2)} km`;
}

export default formatDistanceM;
