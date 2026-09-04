const PATTERNS = [
  /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/,
  /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  /\/maps\/place\/[^/]*\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  /\/maps\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  /[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  /\/maps\?.*center=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  /google\.com\/maps\?q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
];

exports.parseCoords = (url) => {
  for (const pattern of PATTERNS) {
    const match = url.match(pattern);
    if (match && match[1] && match[2]) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }
  }
  return null;
};
