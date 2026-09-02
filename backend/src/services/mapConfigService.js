const pool = require('../utils/db');

const TILE_PROVIDERS = [
  { id: 'leaflet-osm', name: 'Leaflet + OpenStreetMap', type: 'free', auth_type: 'none', requires_key: false, has_cluster: true, cluster_method: 'plugin', tile_url: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', style_url: '', attribution: '&copy; CARTO &copy; OpenStreetMap contributors', subdomains: 'a,b,c,d', api_key: '', description: 'Miễn phí, mã nguồn mở. CARTO CDN (OSM data). Tích hợp Leaflet.markercluster.' },
  { id: 'maplibre-osm', name: 'MapLibre GL JS + OSM', type: 'free', auth_type: 'none', requires_key: false, has_cluster: true, cluster_method: 'built-in', tile_url: '', style_url: 'https://demotiles.maplibre.org/style.json', attribution: 'Trong style JSON', subdomains: '', api_key: '', description: 'Miễn phí, mã nguồn mở. Built-in cluster qua GeoJSON Source.' },
  { id: 'openlayers-osm', name: 'OpenLayers + OSM', type: 'free', auth_type: 'none', requires_key: false, has_cluster: true, cluster_method: 'built-in', tile_url: '', style_url: '', attribution: 'Tự động từ OSM', subdomains: '', api_key: '', description: 'Miễn phí, mã nguồn mở. Built-in cluster qua ol.source.Cluster.' },
  { id: 'maplibre-self-hosted', name: 'MapLibre + Self-hosted Tiles', type: 'self-hosted', auth_type: 'none', requires_key: false, has_cluster: true, cluster_method: 'built-in', tile_url: 'http://{domain}/tiles/{z}/{x}/{y}.pbf', style_url: 'http://{domain}/style.json', attribution: 'Cấu hình theo bản quyền dữ liệu tự host', subdomains: '', api_key: '', description: 'Tự host tile server. Built-in cluster qua GeoJSON Source.' },
  { id: 'leaflet-self-hosted', name: 'Leaflet + Self-hosted Tiles', type: 'self-hosted', auth_type: 'none', requires_key: false, has_cluster: true, cluster_method: 'plugin', tile_url: 'http://{domain}/tiles/{z}/{x}/{y}.png', style_url: '', attribution: 'Cấu hình theo bản quyền dữ liệu tự host', subdomains: '', api_key: '', description: 'Tự host tile server. Tích hợp plugin Leaflet.markercluster.' },
  { id: 'mapbox', name: 'Mapbox GL JS', type: 'api', auth_type: 'token', requires_key: true, has_cluster: true, cluster_method: 'built-in', tile_url: '', style_url: 'mapbox://styles/mapbox/streets-v12', attribution: '&copy; Mapbox &copy; OpenStreetMap', subdomains: '', api_key: '', description: 'Free tier / Trả phí. Access Token + Style URL. Built-in cluster.', style_options: [{ value: 'mapbox/streets-v12', label: 'Streets' }, { value: 'mapbox/outdoors-v12', label: 'Outdoors' }, { value: 'mapbox/light-v11', label: 'Light' }, { value: 'mapbox/dark-v11', label: 'Dark' }, { value: 'mapbox/satellite-streets-v12', label: 'Satellite Streets' }] },
  { id: 'google-maps', name: 'Google Maps Platform', type: 'api', auth_type: 'token', requires_key: true, has_cluster: true, cluster_method: 'library', tile_url: '', style_url: '', attribution: '&copy; Google', subdomains: '', api_key: '', description: 'Free tier / Trả phí. API Key + Map ID. Dùng @googlemaps/markerclusterer.' },
  { id: 'here-maps', name: 'HERE Maps (HERE SDK/JS)', type: 'api', auth_type: 'token', requires_key: true, has_cluster: true, cluster_method: 'built-in', tile_url: '', style_url: '', attribution: '&copy; HERE', subdomains: '', api_key: '', description: 'Free tier / Trả phí. API Key + Engine/Layer Config. Built-in H.clustering.Provider.', style_options: [{ value: 'explore.day', label: 'Explore Day' }, { value: 'explore.night', label: 'Explore Night' }, { value: 'explore.satellite.day', label: 'Satellite Day' }] },
  { id: 'tomtom-maps', name: 'TomTom Maps SDK', type: 'api', auth_type: 'token', requires_key: true, has_cluster: true, cluster_method: 'library', tile_url: '', style_url: 'tomtom://vector/style/main', attribution: '&copy; TomTom', subdomains: '', api_key: '', description: 'Free tier / Trả phí. API Key + Style URL. Cluster qua thư viện hỗ trợ.', style_options: [{ value: 'tomtom://vector/style/main', label: 'Main' }, { value: 'tomtom://vector/style/hybrid', label: 'Hybrid' }, { value: 'tomtom://vector/style/satellite', label: 'Satellite' }] },
  { id: 'arcgis-js', name: 'ArcGIS Maps SDK for JS', type: 'api', auth_type: 'token', requires_key: true, has_cluster: true, cluster_method: 'built-in', tile_url: '', style_url: 'arcgis/topographic', attribution: '&copy; Esri', subdomains: '', api_key: '', description: 'Free tier / Trả phí. API Key qua esriConfig.apiKey. Built-in FeatureLayer.featureReduction.', style_options: [{ value: 'arcgis/topographic', label: 'Topographic' }, { value: 'arcgis/streets', label: 'Streets' }, { value: 'arcgis/satellite', label: 'Satellite' }, { value: 'arcgis/dark-gray', label: 'Dark Gray' }] },
];

exports.getTileProviders = () => TILE_PROVIDERS;

exports.getConfig = async (entity) => {
  const [rows] = await pool.query('SELECT * FROM map_configs WHERE entity = ? LIMIT 1', [entity || 'stations']);
  return rows.length > 0 ? rows[0] : null;
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
