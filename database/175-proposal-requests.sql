-- 175: Bang "Yeu cau de xuat" (proposal_requests) cho tab "De xuat can thuc hien"
-- Idempotent: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS proposal_requests (
  id INT AUTO_INCREMENT,
  proposal_id INT NOT NULL,
  request_type ENUM('UPDATE_INFO','SUPPLEMENT','RE_GRADE','REVISE_BCDX','TGD_REVIEW','OTHER') NOT NULL DEFAULT 'UPDATE_INFO',
  description TEXT NULL,
  requested_by INT NULL,
  previous_status VARCHAR(30) NULL,
  current_status VARCHAR(30) NULL,
  target_department VARCHAR(100) NULL,
  target_title VARCHAR(100) NULL,
  target_user_id INT NULL,
  round_no INT NOT NULL DEFAULT 1,
  note TEXT NULL,
  status ENUM('OPEN','DONE','CANCELLED') NOT NULL DEFAULT 'OPEN',
  resolved_by INT NULL,
  resolved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_proposal_status (proposal_id, status),
  KEY idx_status_created (status, created_at),
  KEY idx_target_user (target_user_id, status),
  CONSTRAINT fk_proposal_requests_proposal FOREIGN KEY (proposal_id) REFERENCES station_proposals(id) ON DELETE CASCADE,
  CONSTRAINT fk_proposal_requests_requested_by FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_proposal_requests_target_user FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
