-- 136: Assignment history for Leads.
-- Contract: docs/8/mkt/02-database-contract.md
-- Rollback: drop this table only if the feature has no assignment history to retain.
-- Idempotent.

CREATE TABLE IF NOT EXISTS lead_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  assignee_user_id INT NOT NULL,
  assigned_department VARCHAR(150) NOT NULL,
  assignment_type ENUM('auto', 'manual') NOT NULL DEFAULT 'auto',
  assigned_by INT NULL,
  reason VARCHAR(255) NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_lead_assignments_lead (lead_id),
  KEY idx_lead_assignments_assignee (assignee_user_id, started_at),
  KEY idx_lead_assignments_active (lead_id, ended_at),
  CONSTRAINT fk_lead_assignments_lead FOREIGN KEY (lead_id)
    REFERENCES leads (id) ON DELETE CASCADE,
  CONSTRAINT fk_lead_assignments_assignee FOREIGN KEY (assignee_user_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_lead_assignments_by FOREIGN KEY (assigned_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
