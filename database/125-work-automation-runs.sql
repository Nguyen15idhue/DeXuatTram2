-- 125: Lich su chay automation (docs/8/66, Buoc 1)
-- Idempotent.

CREATE TABLE IF NOT EXISTS work_automation_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  automation_id INT NOT NULL,
  proposal_id INT NULL,
  proposal_code VARCHAR(50) NULL,
  contact_code VARCHAR(50) NULL,
  process_id INT NULL,
  `trigger` ENUM('auto','manual') NOT NULL DEFAULT 'auto',
  action VARCHAR(50) NOT NULL DEFAULT 'move_to_project',
  status ENUM('pending','running','success','failed','skipped') NOT NULL DEFAULT 'pending',
  attempt INT NOT NULL DEFAULT 0,
  request_json JSON NULL,
  response_json JSON NULL,
  error TEXT NULL,
  started_at TIMESTAMP NULL,
  finished_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_runs_automation (automation_id),
  INDEX idx_runs_proposal (proposal_id),
  INDEX idx_runs_code (proposal_code),
  INDEX idx_runs_status (status),
  CONSTRAINT fk_runs_automation FOREIGN KEY (automation_id) REFERENCES work_automations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
