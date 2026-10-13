export function formatDistanceM(m) {
  const n = Number(m);
  if (!Number.isFinite(n)) return '';
  if (Math.abs(n) < 1000) return `${Math.round(n)} m`;
  return `${(n / 1000).toFixed(2)} km`;
}

export function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const aLat1 = parseFloat(lat1);
  const aLng1 = parseFloat(lng1);
  const aLat2 = parseFloat(lat2);
  const aLng2 = parseFloat(lng2);
  if ([aLat1, aLng1, aLat2, aLng2].some((v) => Number.isNaN(v))) return 0;
  const dLat = toRad(aLat2 - aLat1);
  const dLng = toRad(aLng2 - aLng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat1)) * Math.cos(toRad(aLat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function measureTotalM(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineM(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
  }
  return total;
}

export default formatDistanceM;
