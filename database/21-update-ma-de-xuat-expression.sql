-- 21-update-ma-de-xuat-expression.sql
-- Chuyen dinh dang 4 chu so vao trong formula (LPAD) thay vi pad cung trong code.
-- SEQ tra ve so tho, LPAD(..., 4, '0') format trong expression.
UPDATE field_definitions
SET formula_config = '{"compute_mode": "post", "expression": "CONCAT(mo_hinh_dau_tu, ''_'', ma_tinh, ''_'', LPAD(SEQ(CONCAT(mo_hinh_dau_tu, ''_'', ma_tinh)), 4, ''0''))", "referencedFields": ["mo_hinh_dau_tu", "ma_tinh"], "outputType": "text"}'
WHERE entity = 'station_proposals' AND `key` = 'ma_de_xuat';
