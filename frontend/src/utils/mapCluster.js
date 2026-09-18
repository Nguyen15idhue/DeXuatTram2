export const CLUSTER_DEFAULTS = { radius: 70, maxZoom: 18 };
export const CLUSTER_LIMITS = { radiusMin: 20, radiusMax: 150, maxZoomMin: 8, maxZoomMax: 20 };

const clampInt = (v, min, max, fallback) => {
  const n = parseInt(v, 10);
  if (isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

export function normalizeClusterOptions(input) {
  const src = input || {};
  return {
    radius: clampInt(
      src.radius ?? src.cluster_radius ?? src.clusterRadius,
      CLUSTER_LIMITS.radiusMin, CLUSTER_LIMITS.radiusMax, CLUSTER_DEFAULTS.radius
    ),
    maxZoom: clampInt(
      src.maxZoom ?? src.cluster_max_zoom ?? src.clusterMaxZoom,
      CLUSTER_LIMITS.maxZoomMin, CLUSTER_LIMITS.maxZoomMax, CLUSTER_DEFAULTS.maxZoom
    ),
  };
}

export function clusterSig(opts) {
  const n = normalizeClusterOptions(opts);
  return `${n.radius}/${n.maxZoom}`;
}

export default normalizeClusterOptions;
