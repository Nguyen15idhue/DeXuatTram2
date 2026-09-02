CREATE TABLE IF NOT EXISTS map_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL DEFAULT 'default',
  entity VARCHAR(50) NOT NULL,
  label_field VARCHAR(100) DEFAULT 'name',
  -- Tile config
  tile_provider VARCHAR(50) DEFAULT 'osm',
  tile_url VARCHAR(500) DEFAULT 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  tile_attribution VARCHAR(500) DEFAULT '&copy; OpenStreetMap contributors',
  tile_subdomains VARCHAR(100) DEFAULT 'a,b,c',
  -- Display config
  show_boundaries TINYINT(1) DEFAULT 1,
  show_cluster TINYINT(1) DEFAULT 1,
  show_province_labels TINYINT(1) DEFAULT 1,
  center_lat DECIMAL(10,7) DEFAULT 14.0583,
  center_lng DECIMAL(10,7) DEFAULT 108.2772,
  default_zoom INT DEFAULT 6,
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_name_entity (name, entity)
);

INSERT INTO map_configs (name, entity, tile_provider, tile_url, tile_attribution, tile_subdomains)
VALUES ('default', 'stations', 'osm', 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', '&copy; OpenStreetMap contributors', 'a,b,c')
ON DUPLICATE KEY UPDATE tile_url = VALUES(tile_url);
