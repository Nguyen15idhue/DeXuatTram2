-- 145: Sua cascading Tinh -> Phuong/Xa cho leads.
-- Truong 'ward' co parent_field='tinh' (datalist 4 cot 'tinh'), nhung 'province' dang
-- dung datalist 10 cot 'ten_tinh' => getParentValue('tinh') khong tim thay field cha
-- (field nao co data_list_column='tinh'), nen Phuong/Xa luon rong.
-- Dong bo 'province' sang datalist 4 cot 'tinh' (cung 34 tinh, gia tri giong het
-- datalist 10 => khong doi gia tri da luu). Idempotent.
UPDATE field_definitions
SET data_list_id = 4,
    data_list_column = 'tinh',
    data_list_label_column = NULL
WHERE entity = 'leads'
  AND `key` = 'province'
  AND (data_list_id <> 4 OR data_list_column <> 'tinh' OR data_list_label_column IS NOT NULL);
