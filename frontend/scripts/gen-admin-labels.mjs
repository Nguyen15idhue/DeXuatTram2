import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = 'https://raw.githubusercontent.com/open-admin-data/vietnam-administrative-divisions/main/data';
const PRE_PROVINCE_LABELS = 'https://raw.githubusercontent.com/viettrace/viettrace-map-web/main/public/data/province-labels-pre.json';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const round = (v) => Math.round(v * 10000) / 10000;

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

function stripPrefix(name) {
  return String(name || '')
    .replace(/^Thành phố\s+/i, '')
    .replace(/^Tỉnh\s+/i, '')
    .replace(/^TP\.?\s+/i, '')
    .trim();
}

function pointFeature(name, lat, lon, props = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [round(lon), round(lat)] },
    properties: { name, ...props },
  };
}

const provinces = await getJSON(`${BASE}/all-province.json`);
const wards = await getJSON(`${BASE}/all-ward.json`);

const provFeatures = provinces.map((p) => {
  const lat = parseFloat(p.geo?.lat);
  const lon = parseFloat(p.geo?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const name = p.name?.local || p.name?.en || '';
  return pointFeature(name, lat, lon, { level: 'province', code: p.id, province: name });
}).filter(Boolean);

const wardFeatures = wards.map((w) => {
  const lat = parseFloat(w.geo?.lat);
  const lon = parseFloat(w.geo?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const name = w.name?.local || w.name?.en || '';
  return pointFeature(name, lat, lon, { level: 'ward', province: w.parent?.name?.local || '' });
}).filter(Boolean);

const preLabels = await getJSON(PRE_PROVINCE_LABELS);
const oldProvinceFeatures = (preLabels.features || []).map((f) => {
  const [lon, lat] = f.geometry?.coordinates || [];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return pointFeature(stripPrefix(f.properties?.name), lat, lon, { level: 'province', old: true });
}).filter(Boolean);

writeFileSync(
  join(OUT, 'vn-provinces-labels.geojson'),
  JSON.stringify({ type: 'FeatureCollection', features: provFeatures }),
  'utf8'
);
writeFileSync(
  join(OUT, 'vn-provinces-labels-old.geojson'),
  JSON.stringify({ type: 'FeatureCollection', features: oldProvinceFeatures }),
  'utf8'
);
writeFileSync(
  join(OUT, 'vn-wards-labels.geojson'),
  JSON.stringify({ type: 'FeatureCollection', features: wardFeatures }),
  'utf8'
);

console.log(`OK provinces=${provFeatures.length} provincesOld=${oldProvinceFeatures.length} wards=${wardFeatures.length}`);
