-- 182: Chi hien thi so luong tru chot va tong gia tri chot tren form Xem/sua.
-- Du lieu chi duoc cap nhat qua luong upload BCĐX de dam bao tong gia tri luon duoc tinh dong bo.
-- Idempotent.

UPDATE form_fields ff
JOIN field_definitions fd ON fd.id = ff.field_id
SET ff.config = JSON_SET(COALESCE(ff.config, JSON_OBJECT()), '$.readonly', TRUE)
WHERE ff.form_id = 14
  AND fd.entity = 'station_proposals'
  AND fd.`key` IN ('chot_so_luong_tru', 'tong_gia_tri_chot');
