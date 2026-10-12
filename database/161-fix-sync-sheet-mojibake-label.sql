-- 161: Fix mojibake label 'Trang thai cuoi cung' trong automation_sheet_mappings
-- Nguyen nhan: label bi ghi 1 lan qua request body khong UTF-8 (UTF-8 giai ma nhu Latin-1),
-- DB luu trung thanh chuoi sai. Mapping thang + header reconcile se tu lan ra Sheet o luot sync toi.
UPDATE automation_sheet_mappings
SET label = 'Trạng thái cuối cùng'
WHERE label LIKE '%Tráº%' OR label LIKE '%cuá»%';
