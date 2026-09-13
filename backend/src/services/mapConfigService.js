const pool = require('../utils/db');

const TILE_PROVIDERS = [
  { id: 'leaflet-osm', name: 'Leaflet + OpenStreetMap', type: 'free', auth_type: 'none', requires_key: false, has_cluster: true, cluster_method: 'plugin', supports_retina: false, tile_url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png', style_url: '', attribution: '© OpenStreetMap contributors', subdomains: '', api_key: '', description: 'Miễn phí, không cần key. OSM mirror (Đức/Pháp) + OpenTopoMap + Esri.', tile_url_styles: [
    { value: 'osm-de', label: 'Sáng (OSM Đức)', url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png' },
    { value: 'osm-fr', label: 'OSM Pháp', url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png' },
    { value: 'opentopo', label: 'Địa hình', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png' },
    { value: 'esri-imagery', label: 'Vệ tinh', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
  ] },
  { id: 'maplibre-osm', name: 'MapLibre GL JS + OSM', type: 'free', auth_type: 'none', requires_key: false, has_cluster: true, cluster_method: 'built-in', tile_url: '', style_url: 'https://demotiles.maplibre.org/style.json', attribution: 'Trong style JSON', subdomains: '', api_key: '', description: 'Miễn phí, mã nguồn mở. Built-in cluster qua GeoJSON Source.' },
  { id: 'openlayers-osm', name: 'OpenLayers + OSM', type: 'free', auth_type: 'none', requires_key: false, has_cluster: true, cluster_method: 'built-in', tile_url: '', style_url: '', attribution: 'Tự động từ OSM', subdomains: '', api_key: '', description: 'Miễn phí, mã nguồn mở. Built-in cluster qua ol.source.Cluster.' },
  { id: 'maplibre-self-hosted', name: 'MapLibre + Self-hosted Tiles', type: 'self-hosted', auth_type: 'none', requires_key: false, has_cluster: true, cluster_method: 'built-in', tile_url: 'https://{domain}/tiles/{z}/{x}/{y}.pbf', style_url: 'https://{domain}/style.json', attribution: 'Cấu hình theo bản quyền dữ liệu tự host', subdomains: '', api_key: '', description: 'Tự host tile server. Built-in cluster qua GeoJSON Source.' },
  { id: 'leaflet-self-hosted', name: 'Leaflet + Self-hosted Tiles', type: 'self-hosted', auth_type: 'none', requires_key: false, has_cluster: true, cluster_method: 'plugin', tile_url: 'https://{domain}/tiles/{z}/{x}/{y}.png', style_url: '', attribution: 'Cấu hình theo bản quyền dữ liệu tự host', subdomains: '', api_key: '', description: 'Tự host tile server. Tích hợp plugin Leaflet.markercluster.' },
  { id: 'esri-basemap', name: 'Esri Basemaps', type: 'free', auth_type: 'none', requires_key: false, has_cluster: true, cluster_method: 'plugin', supports_retina: false, tile_url: '', style_url: '', attribution: '© Esri', subdomains: '', api_key: '', description: 'Miễn phí, không cần key.', tile_url_styles: [
    { value: 'World_Street_Map', label: 'Đường phố', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}' },
    { value: 'World_Imagery', label: 'Vệ tinh', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
    { value: 'World_Topo_Map', label: 'Địa hình', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}' },
  ] },
  { id: 'geoapify', name: 'Geoapify (OSM)', type: 'api', auth_type: 'token', requires_key: true, has_cluster: true, cluster_method: 'plugin', supports_retina: true, tile_url: '', style_url: '', attribution: 'Powered by Geoapify | OpenMapTiles | OpenStreetMap contributors', subdomains: '', api_key: '', api_key_placeholder: 'YOUR_GEOAPIFY_KEY', description: 'Tile OSM chất lượng cao, cần API key. Hỗ trợ retina @2x.', tile_url_styles: [
    { value: 'osm-carto', label: 'OSM Carto', url: 'https://maps.geoapify.com/v1/tile/osm-carto/{z}/{x}/{y}.png?apiKey={key}' },
    { value: 'osm-bright', label: 'OSM Bright', url: 'https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey={key}' },
    { value: 'positron', label: 'Positron', url: 'https://maps.geoapify.com/v1/tile/positron/{z}/{x}/{y}.png?apiKey={key}' },
    { value: 'dark-matter', label: 'Dark Matter', url: 'https://maps.geoapify.com/v1/tile/dark-matter/{z}/{x}/{y}.png?apiKey={key}' },
    { value: 'toner', label: 'Toner', url: 'https://maps.geoapify.com/v1/tile/toner/{z}/{x}/{y}.png?apiKey={key}' },
    { value: 'klokantech-basic', label: 'Klokantech Basic', url: 'https://maps.geoapify.com/v1/tile/klokantech-basic/{z}/{x}/{y}.png?apiKey={key}' },
  ] },
  { id: 'mapbox', name: 'Mapbox GL JS', type: 'api', auth_type: 'token', requires_key: true, has_cluster: true, cluster_method: 'built-in', tile_url: '', style_url: 'mapbox://styles/mapbox/streets-v12', attribution: '&copy; Mapbox &copy; OpenStreetMap', subdomains: '', api_key: '', description: 'Free tier / Trả phí. Access Token + Style URL. Built-in cluster.', style_options: [{ value: 'mapbox/streets-v12', label: 'Streets' }, { value: 'mapbox/outdoors-v12', label: 'Outdoors' }, { value: 'mapbox/light-v11', label: 'Light' }, { value: 'mapbox/dark-v11', label: 'Dark' }, { value: 'mapbox/satellite-streets-v12', label: 'Satellite Streets' }] },
  { id: 'google-maps', name: 'Google Maps Platform', type: 'api', auth_type: 'token', requires_key: true, has_cluster: true, cluster_method: 'library', tile_url: '', style_url: '', attribution: '&copy; Google', subdomains: '', api_key: '', description: 'Free tier / Trả phí. API Key + Map ID. Dùng @googlemaps/markerclusterer.' },
  { id: 'here-maps', name: 'HERE Maps (HERE SDK/JS)', type: 'api', auth_type: 'token', requires_key: true, has_cluster: true, cluster_method: 'built-in', tile_url: '', style_url: '', attribution: '&copy; HERE', subdomains: '', api_key: '', description: 'Free tier / Trả phí. API Key + Engine/Layer Config. Built-in H.clustering.Provider.', style_options: [{ value: 'explore.day', label: 'Explore Day' }, { value: 'explore.night', label: 'Explore Night' }, { value: 'explore.satellite.day', label: 'Satellite Day' }] },
  { id: 'tomtom-maps', name: 'TomTom Maps SDK', type: 'api', auth_type: 'token', requires_key: true, has_cluster: true, cluster_method: 'library', tile_url: '', style_url: 'tomtom://vector/style/main', attribution: '&copy; TomTom', subdomains: '', api_key: '', description: 'Free tier / Trả phí. API Key + Style URL. Cluster qua thư viện hỗ trợ.', style_options: [{ value: 'tomtom://vector/style/main', label: 'Main' }, { value: 'tomtom://vector/style/hybrid', label: 'Hybrid' }, { value: 'tomtom://vector/style/satellite', label: 'Satellite' }] },
  { id: 'arcgis-js', name: 'ArcGIS Maps SDK for JS', type: 'api', auth_type: 'token', requires_key: true, has_cluster: true, cluster_method: 'built-in', tile_url: '', style_url: 'arcgis/topographic', attribution: '&copy; Esri', subdomains: '', api_key: '', description: 'Free tier / Trả phí. API Key qua esriConfig.apiKey. Built-in FeatureLayer.featureReduction.', style_options: [{ value: 'arcgis/topographic', label: 'Topographic' }, { value: 'arcgis/streets', label: 'Streets' }, { value: 'arcgis/satellite', label: 'Satellite' }, { value: 'arcgis/dark-gray', label: 'Dark Gray' }] },
];

exports.getTileProviders = () => TILE_PROVIDERS;

exports.getConfig = async (entity, opts = {}) => {
  const [rows] = await pool.query('SELECT * FROM map_configs WHERE entity = ? LIMIT 1', [entity || 'stations']);
  if (rows.length === 0) return null;
  const row = rows[0];
  if (opts.includeSecret) return row;
  const safe = { ...row };
  if (safe.tile_mode !== 'direct') delete safe.api_key;
  return safe;
};

exports.createConfig = async (data) => {
  const { name, entity, label_field, tile_provider, tile_url, tile_attribution, tile_subdomains, show_boundaries, show_cluster, show_province_labels, center_lat, center_lng, default_zoom } = data;
  const [result] = await pool.query(
    `INSERT INTO map_configs (name, entity, label_field, tile_provider, tile_url, tile_attribution, tile_subdomains, show_boundaries, show_cluster, show_province_labels, center_lat, center_lng, default_zoom)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name || 'default', entity, label_field || 'name', tile_provider || 'osm', tile_url, tile_attribution, tile_subdomains, show_boundaries ?? 1, show_cluster ?? 1, show_province_labels ?? 1, center_lat || 14.0583, center_lng || 108.2772, default_zoom || 6]
  );
  return { id: result.insertId, ...data };
};

exports.updateConfig = async (id, data) => {
  const fields = [];
  const params = [];
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && key !== 'id') {
      fields.push(`${key} = ?`);
      params.push(value);
    }
  }
  if (fields.length === 0) return null;
  params.push(id);
  await pool.query(`UPDATE map_configs SET ${fields.join(', ')} WHERE id = ?`, params);
  const [rows] = await pool.query('SELECT * FROM map_configs WHERE id = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
};

exports.deleteConfig = async (id) => {
  const [result] = await pool.query('DELETE FROM map_configs WHERE id = ?', [id]);
  return result.affectedRows > 0;
};
