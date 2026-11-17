CREATE TABLE IF NOT EXISTS historical_on_import_batches (
  batch_key VARCHAR(100) NOT NULL,
  actor_id INT NOT NULL,
  file_hash CHAR(64) NOT NULL,
  result JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (batch_key),
  KEY idx_historical_on_batch_actor (actor_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
