CREATE TABLE IF NOT EXISTS proposal_signature_snapshots (
  config_id INT NOT NULL PRIMARY KEY,
  image_data MEDIUMBLOB NOT NULL,
  image_sha256 CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_signature_snapshot_config FOREIGN KEY (config_id)
    REFERENCES proposal_signature_configs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
