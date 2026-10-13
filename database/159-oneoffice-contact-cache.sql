-- 159: cache lien he 1Office cho dong bo Sheet (tranh fetch lai moi luot).
CREATE TABLE IF NOT EXISTS oneoffice_contact_cache (
  code VARCHAR(50) PRIMARY KEY,
  contact_json JSON NOT NULL,
  fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fetched_at (fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
