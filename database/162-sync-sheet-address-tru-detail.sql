-- 162: Cot 'Vi tri lap dat' doc tu contact.address thay vi contact.vi_tri_lap_tru
-- Giu nguyen sheet_col + label, chi doi source_path. Cac cot chi tiet loai tru moi
-- (contact.__tru_tdt_detail/nq/lk) se duoc auto-match bo sung (idempotent).
UPDATE automation_sheet_mappings
SET source_path = 'contact.address'
WHERE source_path = 'contact.vi_tri_lap_tru';
