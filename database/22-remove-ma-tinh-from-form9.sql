-- 22-remove-ma-tinh-from-form9.sql
-- Cach 2 (22.BackendTuSuyMaTinh_kehoach.md - Buoc 5): form chi giu o Tinh/Thanh pho,
-- backend tu suy ma_tinh/vung_mien luc luu. Field van giu trong view 8 de hien thi.
DELETE FROM form_fields WHERE form_id = 9 AND field_id = (SELECT id FROM field_definitions WHERE entity = 'station_proposals' AND `key` = 'ma_tinh');
