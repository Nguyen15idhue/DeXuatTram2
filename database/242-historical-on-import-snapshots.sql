CREATE TABLE IF NOT EXISTS historical_on_import_snapshots (
  id BIGINT NOT NULL AUTO_INCREMENT,
  batch_key VARCHAR(100) NOT NULL,
  sheet_row INT NOT NULL,
  proposal_id INT NOT NULL,
  charging_station_id INT NULL,
  actor_id INT NOT NULL,
  fingerprint CHAR(64) NOT NULL,
  snapshot JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_historical_on_snapshot_batch_row (batch_key, sheet_row),
  KEY idx_historical_on_snapshot_proposal (proposal_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
