CREATE TABLE IF NOT EXISTS lead_proposal_save_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id INT NOT NULL,
  actor_id INT NOT NULL,
  request_key VARCHAR(128) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  proposal_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lead_proposal_save_request (lead_id, actor_id, request_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
