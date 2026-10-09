-- 149: Them co include_rest cho views (Excel) de thay the ngu nghia ngam theo `usage`.
-- include_rest = 1: template/export/import dung cot trong view + noi them field con lai (hanh vi cu cua table/excel_full)
-- include_rest = 0: chi dung dung cot trong view (hanh vi cu cua excel_basic)
-- Backfill giu dung ngu nghia cu: excel_basic -> 0, con lai -> 1 (default).
-- Idempotent: chi them cot neu chua co. KHONG dung DROP.

SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'views' AND column_name = 'include_rest');
SET @s := IF(@c = 0,
  'ALTER TABLE views ADD COLUMN include_rest TINYINT NOT NULL DEFAULT 1 AFTER `usage`',
  'SELECT ''include_rest exists'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

UPDATE views SET include_rest = 0 WHERE `usage` = 'excel_basic' AND include_rest <> 0;
UPDATE views SET include_rest = 1 WHERE `usage` <> 'excel_basic' AND include_rest <> 1;

SELECT id, entity, name, `usage`, include_rest FROM views ORDER BY entity, id;
