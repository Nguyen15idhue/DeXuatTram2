const path = require('path');
const beCatalog = require(path.join(__dirname, '..', 'backend', 'src', 'config', 'tileProviders')).TILE_PROVIDERS;

const COMPARE_FIELDS = [
  'id', 'name', 'type', 'auth_type', 'requires_key', 'has_cluster',
  'cluster_method', 'supports_retina', 'incompatible_with_leaflet',
  'attribution', 'subdomains', 'style_url',
];

function norm(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.slice().sort().join(',');
  return String(value);
}

async function main() {
  const fe = await import('file://' + path.join(__dirname, '..', 'frontend', 'src', 'utils', 'tileProviderCatalog.js').replace(/\\/g, '/'));
  const feCatalog = fe.TILE_PROVIDER_CATALOG;

  let failures = 0;
  const beById = new Map(beCatalog.map(p => [p.id, p]));
  const feById = new Map(feCatalog.map(p => [p.id, p]));

  for (const id of beById.keys()) {
    if (!feById.has(id)) { console.log(`FAIL - FE thiếu provider: ${id}`); failures++; }
  }
  for (const id of feById.keys()) {
    if (!beById.has(id)) { console.log(`FAIL - BE thiếu provider: ${id}`); failures++; }
  }

  for (const [id, be] of beById) {
    const fel = feById.get(id);
    if (!fel) continue;
    for (const field of COMPARE_FIELDS) {
      if (norm(be[field]) !== norm(fel[field])) {
        console.log(`FAIL - ${id}.${field}: BE="${norm(be[field])}" FE="${norm(fel[field])}"`);
        failures++;
      }
    }
    const beCaps = norm(be.capabilities);
    const feCaps = norm(fel.capabilities);
    if (!beCaps) { console.log(`FAIL - ${id} thiếu capabilities (BE)`); failures++; }
    if (beCaps !== feCaps) { console.log(`FAIL - ${id}.capabilities: BE="${beCaps}" FE="${feCaps}"`); failures++; }
    const beStyles = (be.tile_url_styles || []).map(s => s.value).sort().join(',');
    const feStyles = (fel.tile_url_styles || []).map(s => s.value).sort().join(',');
    if (beStyles !== feStyles) { console.log(`FAIL - ${id}.tile_url_styles: BE="${beStyles}" FE="${feStyles}"`); failures++; }
  }

  console.log(`Catalog FE vs BE: ${beCatalog.length} providers, ${failures} lệch`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
