-- 162: Cot 'Vi tri lap dat' doc tu contact.address thay vi contact.vi_tri_lap_tru
-- Giu nguyen sheet_col + label, chi doi source_path. Cac cot chi tiet loai tru moi
-- (contact.__tru_tdt_detail/nq/lk) se duoc auto-match bo sung (idempotent).
-- Neu version da co san contact.address (VD DB cu tu auto-match truoc) thi xoa dong
-- vi_tri_lap_tru trung lap truoc de khong pha unique (automation_id, version, source_path).
DELETE m1 FROM automation_sheet_mappings m1
JOIN automation_sheet_mappings m2
  ON m2.automation_id = m1.automation_id
 AND m2.version = m1.version
 AND m2.source_path = 'contact.address'
WHERE m1.source_path = 'contact.vi_tri_lap_tru';
UPDATE automation_sheet_mappings
SET source_path = 'contact.address'
WHERE source_path = 'contact.vi_tri_lap_tru';
