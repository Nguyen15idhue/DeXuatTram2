-- 178: Buoc Danh gia layout (DESIGNING)
-- - Them trang thai INFOR_WAITING (cho nguoi de xuat bo sung thong tin)
-- - Them loai yeu cau LAYOUT_SUPPLEMENT (yeu cau bo sung thong tin de ve layout)
-- - Them field ban_ve_layout (file) + gan vao form Xem/sua de xuat (id 14)
-- Idempotent: chay lai nhieu lan khong loi, khong nhan doi du lieu.

-- ============ 1. Them trang thai INFOR_WAITING vao ENUM ============
SET @status_type := (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station_proposals' AND COLUMN_NAME = 'status'
);
SET @sql_status_enum := IF(@status_type NOT LIKE '%INFOR_WAITING%',
  'ALTER TABLE station_proposals MODIFY COLUMN status ENUM(
    ''PENDING'',''REVIEWING'',''PRINCIPLE_APPROVED'',''APPROVED'',''REJECTED'',''CANCELLED'',
    ''CONTRACT_SIGNED'',''CONTRACT_FAILED'',''ARCHIVED'',
    ''GRADING'',''GDTTKD_EVALUATING'',''RE_GRADING'',''RE_GDTTKD_EVALUATING'',''TGD_REVIEW'',''DESIGNING'',
    ''INFOR_WAITING'',
    ''PROPOSAL_REPORT_CREATING'',''PROPOSAL_REPORT_REVIEWING'',''SIGNATURE_PENDING'',''COMPLETED''
  ) NULL DEFAULT ''PENDING''',
  'SELECT ''status enum da co INFOR_WAITING'' AS info');
PREPARE stmt_status_enum FROM @sql_status_enum;
EXECUTE stmt_status_enum;
DEALLOCATE PREPARE stmt_status_enum;

-- ============ 2. Them loai yeu cau LAYOUT_SUPPLEMENT ============
SET @req_type := (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposal_requests' AND COLUMN_NAME = 'request_type'
);
SET @sql_req_type := IF(@req_type NOT LIKE '%LAYOUT_SUPPLEMENT%',
  'ALTER TABLE proposal_requests MODIFY COLUMN request_type ENUM(
    ''UPDATE_INFO'',''SUPPLEMENT'',''LAYOUT_SUPPLEMENT'',''RE_GRADE'',''REVISE_BCDX'',''TGD_REVIEW'',''OTHER''
  ) NOT NULL DEFAULT ''UPDATE_INFO''',
  'SELECT ''request_type enum da co LAYOUT_SUPPLEMENT'' AS info');
PREPARE stmt_req_type FROM @sql_req_type;
EXECUTE stmt_req_type;
DEALLOCATE PREPARE stmt_req_type;

-- ============ 3. Field definition ban_ve_layout ============
INSERT INTO field_definitions
  (entity, `key`, label, type, source_type, required, help_text, is_locked, status)
SELECT 'station_proposals', 'ban_ve_layout', 'Bản vẽ layout', 'file', 'json', 0,
       'Bản vẽ layout do Phòng Công nghệ và Quy hoạch tải lên khi xử lý đề xuất', 1, 'active'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'ban_ve_layout'
);

-- ============ 4. Them option trang thai INFOR_WAITING ============
UPDATE field_definitions
SET options = JSON_ARRAY_APPEND(options, '$', JSON_OBJECT(
  'value', 'INFOR_WAITING',
  'label', 'Chờ bổ sung thông tin',
  'color', '#f97316',
  'icon', 'clock',
  'sort_order', 14.5,
  'show_in_legend', 0,
  'borderRadius', 'rounded'
))
WHERE entity = 'station_proposals' AND `key` = 'status'
  AND JSON_SEARCH(options, 'one', 'INFOR_WAITING', NULL, '$[*].value') IS NULL;

-- ============ 5. Gan field ban_ve_layout vao form Xem/sua de xuat (id 14) ============
SET @layout_field_id := (
  SELECT id FROM field_definitions
  WHERE entity = 'station_proposals' AND `key` = 'ban_ve_layout' LIMIT 1
);

INSERT INTO form_fields (form_id, field_id, order_index, visible, config)
SELECT 14, @layout_field_id,
       (SELECT COALESCE(MAX(order_index), 0) + 1 FROM form_fields WHERE form_id = 14),
       1,
       JSON_OBJECT('rowId', 'station_proposals_view_s7_r3', 'colSpan', 1, 'colIndex', 0, 'rowIndex', 2)
FROM DUAL
WHERE @layout_field_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM form_fields WHERE form_id = 14 AND field_id = @layout_field_id
  );

UPDATE forms
SET layout_config = JSON_ARRAY_APPEND(
      layout_config,
      '$.sections[6].rows',
      JSON_OBJECT('id', 'station_proposals_view_s7_r3', 'columns', '1:1')
    ),
    updated_at = NOW()
WHERE id = 14
  AND layout_config IS NOT NULL
  AND JSON_SEARCH(layout_config, 'one', 'station_proposals_view_s7_r3') IS NULL;
