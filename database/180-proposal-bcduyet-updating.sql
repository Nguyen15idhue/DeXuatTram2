-- 180: Buoc Duyet BCĐX (Back Office)
-- - Them trang thai PROPOSAL_REPORT_UPDATING (Back office yeu cau cap nhat lai file BCĐX)
-- - Bang luu cau hinh ky (vi tri o ky tren file BCĐX)
-- Idempotent: chay lai nhieu lan khong loi, khong nhan doi du lieu.

-- ============ 1. Them trang thai PROPOSAL_REPORT_UPDATING vao ENUM ============
SET @status_type := (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'status'
);
SET @sql_status_enum := IF(@status_type NOT LIKE '%PROPOSAL_REPORT_UPDATING%',
  'ALTER TABLE station_proposals MODIFY COLUMN status ENUM(
    ''PENDING'',''REVIEWING'',''PRINCIPLE_APPROVED'',''APPROVED'',''REJECTED'',''CANCELLED'',
    ''CONTRACT_SIGNED'',''CONTRACT_FAILED'',''ARCHIVED'',
    ''GRADING'',''GDTTKD_EVALUATING'',''RE_GRADING'',''RE_GDTTKD_EVALUATING'',''TGD_REVIEW'',''DESIGNING'',
    ''INFOR_WAITING'',
    ''PROPOSAL_REPORT_CREATING'',''PROPOSAL_REPORT_RE_CREATING'',
    ''PROPOSAL_REPORT_REVIEWING'',''PROPOSAL_REPORT_UPDATING'',
    ''SIGNATURE_PENDING'',''COMPLETED''
  ) NULL DEFAULT ''PENDING''',
  'SELECT ''status enum da co PROPOSAL_REPORT_UPDATING'' AS info');
PREPARE stmt_status_enum FROM @sql_status_enum;
EXECUTE stmt_status_enum;
DEALLOCATE PREPARE stmt_status_enum;

-- ============ 2. Them option trang thai PROPOSAL_REPORT_UPDATING ============
UPDATE field_definitions
SET options = JSON_ARRAY_APPEND(options, '$', JSON_OBJECT(
  'value', 'PROPOSAL_REPORT_UPDATING',
  'label', 'Chờ cập nhật lại BCĐX',
  'color', '#f97316',
  'icon', 'clipboardList',
  'sort_order', 16.5,
  'show_in_legend', 0,
  'borderRadius', 'rounded'
))
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND JSON_SEARCH(options, 'one', 'PROPOSAL_REPORT_UPDATING', NULL, '$[*].value') IS NULL;

-- ============ 3. Bang cau hinh ky cho de xuat ============
CREATE TABLE IF NOT EXISTS proposal_signature_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  proposal_id INT NOT NULL COMMENT 'De xuat duoc cau hinh ky',
  file_id INT NULL COMMENT 'File BCĐX duoc dung de ky',
  user_id INT NOT NULL COMMENT 'Nguoi ky',
  signer_title VARCHAR(150) NULL COMMENT 'Chuc vu/hien thi nguoi ky',
  page INT NOT NULL DEFAULT 1 COMMENT 'Trang cua file BCĐX',
  pos_x DECIMAL(7,5) NOT NULL DEFAULT 0 COMMENT 'Toa do X chuan hoa 0..1',
  pos_y DECIMAL(7,5) NOT NULL DEFAULT 0 COMMENT 'Toa do Y chuan hoa 0..1',
  box_width DECIMAL(7,5) NOT NULL DEFAULT 0.25 COMMENT 'Rong o ky chuan hoa 0..1',
  box_height DECIMAL(7,5) NOT NULL DEFAULT 0.06 COMMENT 'Cao o ky chuan hoa 0..1',
  status ENUM('PENDING','SIGNED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  signed_at DATETIME NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_psc_proposal (proposal_id),
  KEY idx_psc_user (user_id, status),
  CONSTRAINT fk_psc_proposal FOREIGN KEY (proposal_id) REFERENCES station_proposals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
