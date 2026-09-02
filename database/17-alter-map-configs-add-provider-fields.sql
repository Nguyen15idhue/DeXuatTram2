-- 17: Add tile provider config fields to map_configs
-- tile_provider_id: references provider in tileProviders.js (e.g. 'leaflet-osm', 'mapbox')
-- api_key: stored API key for paid providers
-- style_url: custom style URL (Mapbox style, MapLibre style.json, etc.)
-- auth_type: 'none' or 'token'

ALTER TABLE map_configs
  ADD COLUMN tile_provider_id VARCHAR(50) DEFAULT 'leaflet-osm' AFTER entity,
  ADD COLUMN api_key VARCHAR(500) DEFAULT '' AFTER tile_provider_id,
  ADD COLUMN style_url VARCHAR(500) DEFAULT '' AFTER api_key,
  ADD COLUMN auth_type VARCHAR(20) DEFAULT 'none' AFTER style_url;

-- Update existing records to use new field
UPDATE map_configs SET tile_provider_id = 'leaflet-osm', auth_type = 'none' WHERE tile_provider = 'osm';
UPDATE map_configs SET tile_provider_id = tile_provider WHERE tile_provider_id = 'leaflet-osm' AND tile_provider != 'osm';
