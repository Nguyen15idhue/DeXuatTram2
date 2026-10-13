-- 134: Business journeys + leads (MKT pipeline)
-- Contract: docs/8/mkt/02-database-contract.md
-- Idempotent. Duplicate phone/email validation belongs to the service layer.

CREATE TABLE IF NOT EXISTS business_journeys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  journey_code CHAR(36) NOT NULL,
  current_stage VARCHAR(30) NOT NULL DEFAULT 'NEW',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_business_journeys_code (journey_code),
  KEY idx_business_journeys_stage_created (current_stage, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lead_code VARCHAR(50) NULL,
  journey_id INT NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255) NULL,
  address TEXT NULL,
  province VARCHAR(150) NULL,
  ward VARCHAR(150) NULL,
  province_code VARCHAR(20) NULL,
  region VARCHAR(100) NULL,
  customer_type VARCHAR(100) NOT NULL,
  source VARCHAR(100) NOT NULL,
  note TEXT NULL,
  stage VARCHAR(30) NOT NULL DEFAULT 'NEW',
  customer_classification VARCHAR(100) NULL,
  sales_outcome VARCHAR(30) NULL,
  assigned_user_id INT NULL,
  assigned_department VARCHAR(150) NULL,
  assigned_at DATETIME NULL,
  created_by INT NOT NULL,
  deleted_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_leads_journey (journey_id),
  KEY idx_leads_created (created_at),
  KEY idx_leads_stage_created (stage, created_at),
  KEY idx_leads_classification_created (customer_classification, created_at),
  KEY idx_leads_source_created (source, created_at),
  KEY idx_leads_province_created (province, created_at),
  KEY idx_leads_assigned_created (assigned_user_id, created_at),
  KEY idx_leads_deleted_created (deleted_at, created_at),
  KEY idx_leads_phone (phone),
  KEY idx_leads_email (email),
  CONSTRAINT fk_leads_journey FOREIGN KEY (journey_id)
    REFERENCES business_journeys (id) ON DELETE CASCADE,
  CONSTRAINT fk_leads_assigned_user FOREIGN KEY (assigned_user_id)
    REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_created_by FOREIGN KEY (created_by)
    REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
