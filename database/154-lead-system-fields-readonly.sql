-- 154: khoa cac truong Lead do he thong quan ly tren form + gioi han pool chon Nguoi phu trach.
-- - stage (Giai doan), region (Vung mien), assigned_department (Phong ban phu trach):
--   readonly (backend tu suy / tu sync, PUT truc tiep bi bo qua hoac chan).
-- - assigned_user_id (Nguoi phu trach): dat user_pool = 'gdkv' de UserField chi hien
--   pool Giam doc Khu vuc (doi nguoi khac phai dung Phân chia Leads).
-- Idempotent (JSON_SET ghi de cung gia tri khi chay lai).

UPDATE field_definitions
SET source_config = JSON_SET(IFNULL(source_config, JSON_OBJECT()), '$.readonly', TRUE)
WHERE entity = 'leads' AND `key` IN ('stage', 'region', 'assigned_department');

UPDATE field_definitions
SET source_config = JSON_SET(IFNULL(source_config, JSON_OBJECT()), '$.user_pool', 'gdkv')
WHERE entity = 'leads' AND `key` = 'assigned_user_id';
