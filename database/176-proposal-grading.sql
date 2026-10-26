-- 176: Bo sung diem danh gia Quy hoach / Phap ly cho de xuat (trang Danh gia quy hoach va Phap ly)
-- Idempotent: chay lai nhieu lan khong loi, khong nhan doi du lieu.

-- ============ 1. Cot diem / danh gia tung phong ban ============
SET @has_qh_score := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'quy_hoach_score'
);
SET @sql_qh_score := IF(@has_qh_score = 0,
  'ALTER TABLE station_proposals ADD COLUMN quy_hoach_score TINYINT NULL AFTER note',
  'SELECT ''cot station_proposals.quy_hoach_score da ton tai'' AS info');
PREPARE stmt_qh_score FROM @sql_qh_score;
EXECUTE stmt_qh_score;
DEALLOCATE PREPARE stmt_qh_score;

SET @has_qh_note := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'quy_hoach_note'
);
SET @sql_qh_note := IF(@has_qh_note = 0,
  'ALTER TABLE station_proposals ADD COLUMN quy_hoach_note TEXT NULL AFTER quy_hoach_score',
  'SELECT ''cot station_proposals.quy_hoach_note da ton tai'' AS info');
PREPARE stmt_qh_note FROM @sql_qh_note;
EXECUTE stmt_qh_note;
DEALLOCATE PREPARE stmt_qh_note;

SET @has_pl_score := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'phap_ly_score'
);
SET @sql_pl_score := IF(@has_pl_score = 0,
  'ALTER TABLE station_proposals ADD COLUMN phap_ly_score TINYINT NULL AFTER quy_hoach_note',
  'SELECT ''cot station_proposals.phap_ly_score da ton tai'' AS info');
PREPARE stmt_pl_score FROM @sql_pl_score;
EXECUTE stmt_pl_score;
DEALLOCATE PREPARE stmt_pl_score;

SET @has_pl_note := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'phap_ly_note'
);
SET @sql_pl_note := IF(@has_pl_note = 0,
  'ALTER TABLE station_proposals ADD COLUMN phap_ly_note TEXT NULL AFTER phap_ly_score',
  'SELECT ''cot station_proposals.phap_ly_note da ton tai'' AS info');
PREPARE stmt_pl_note FROM @sql_pl_note;
EXECUTE stmt_pl_note;
DEALLOCATE PREPARE stmt_pl_note;

-- ============ 2. Index cho tab "Can thuc hien" ============
SET @has_idx_qh := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND INDEX_NAME = 'idx_proposal_grading_qh'
);
SET @sql_idx_qh := IF(@has_idx_qh = 0,
  'ALTER TABLE station_proposals ADD INDEX idx_proposal_grading_qh (status, quy_hoach_score)',
  'SELECT ''index idx_proposal_grading_qh da ton tai'' AS info');
PREPARE stmt_idx_qh FROM @sql_idx_qh;
EXECUTE stmt_idx_qh;
DEALLOCATE PREPARE stmt_idx_qh;

SET @has_idx_pl := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND INDEX_NAME = 'idx_proposal_grading_pl'
);
SET @sql_idx_pl := IF(@has_idx_pl = 0,
  'ALTER TABLE station_proposals ADD INDEX idx_proposal_grading_pl (status, phap_ly_score)',
  'SELECT ''index idx_proposal_grading_pl da ton tai'' AS info');
PREPARE stmt_idx_pl FROM @sql_idx_pl;
EXECUTE stmt_idx_pl;
DEALLOCATE PREPARE stmt_idx_pl;

-- ============ 3. Field definitions cho 4 cot moi ============
INSERT INTO field_definitions
  (entity, `key`, label, type, source_type, required, number_format, decimal_places, help_text, is_locked, status)
SELECT 'station_proposals', 'quy_hoach_score', 'Quy hoạch chấm điểm', 'number', 'fixed', 0, 'integer', 0,
       'Thang điểm 0-3 do Phòng Quy hoạch chấm', 1, 'active'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'quy_hoach_score'
);

INSERT INTO field_definitions
  (entity, `key`, label, type, source_type, required, is_locked, status)
SELECT 'station_proposals', 'quy_hoach_note', 'Quy hoạch đánh giá', 'textarea', 'fixed', 0, 1, 'active'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'quy_hoach_note'
);

INSERT INTO field_definitions
  (entity, `key`, label, type, source_type, required, number_format, decimal_places, help_text, is_locked, status)
SELECT 'station_proposals', 'phap_ly_score', 'Pháp lý chấm điểm', 'number', 'fixed', 0, 'integer', 0,
       'Thang điểm 0-3 do Phòng Pháp lý chấm', 1, 'active'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'phap_ly_score'
);

INSERT INTO field_definitions
  (entity, `key`, label, type, source_type, required, is_locked, status)
SELECT 'station_proposals', 'phap_ly_note', 'Pháp lý đánh giá', 'textarea', 'fixed', 0, 1, 'active'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'phap_ly_note'
);
