-- 145: Sua cascading Tinh -> Phuong/Xa cho leads.
-- Truong 'ward' co parent_field='tinh' (datalist 'Danh mục Phường Xã' cot 'tinh'), nhung
-- 'province' dang dung datalist 'Tỉnh' cot 'ten_tinh' => getParentValue('tinh') khong tim thay
-- field cha (field nao co data_list_column='tinh'), nen Phuong/Xa luon rong.
-- Dong bo 'province' sang datalist 'Danh mục Phường Xã' cot 'tinh' (cung gia tri ten tinh
-- => khong doi gia tri da luu). Tra cuu id THEO TEN (portable dev/VPS). Idempotent.
SET @xa_dl = (
  SELECT id FROM data_lists
  WHERE name IN ('Danh mục Phường Xã', 'Danh muc Phuong Xa', 'Xã', 'dm_xa')
    AND JSON_SEARCH(columns_config, 'one', 'tinh') IS NOT NULL
  ORDER BY FIELD(name, 'Danh mục Phường Xã', 'Danh muc Phuong Xa', 'Xã', 'dm_xa'), id ASC
  LIMIT 1
);

UPDATE field_definitions
SET data_list_id = @xa_dl,
    data_list_column = 'tinh',
    data_list_label_column = NULL
WHERE entity = 'leads'
  AND `key` = 'province'
  AND @xa_dl IS NOT NULL
  AND (data_list_id <> @xa_dl OR data_list_column <> 'tinh' OR data_list_label_column IS NOT NULL);
