-- 85: Phuc hoi hang orphan cua "So tai khoan" + "Ngan hang" trong section NQ (s6).
-- Nguyen nhan: migration 81 reset rows s6 ve r1..r8, lam mat hang da them qua UI
-- (r1789462381325 o form 13, r1789462595506 o form 14) chua 2 field nay.
-- He qua: nq_so_tai_khoan required=1 nhung khong render + khong bao gio hidden
-- -> form 13 (Tao de xuat thuong) KHONG BAO GIO submit duoc voi moi mo_hinh_dau_tu,
-- frontend bao "So tai khoan la bat buoc" nhung khong co o de nhap;
-- backend getApplicableFieldKeys dung chung layout_config nen cung chan (400).
-- Form nhanh 17 khong chua field nay nen van tao duoc -> dung trieu chung da bao.
-- Fix: them hang s6_r9 (1:2) vao layout + chuyen 2 field ve hang nay. Idempotent.

-- ===== Form 13 (create): them hang s6_r9 =====
UPDATE forms
SET layout_config = JSON_SET(
  layout_config,
  '$.sections[5].rows', JSON_ARRAY(
    JSON_OBJECT('id','station_proposals_create_s6_r1','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s6_r2','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s6_r3','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s6_r4','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s6_r5','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s6_r6','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s6_r7','columns','1:1'),
    JSON_OBJECT('id','station_proposals_create_s6_r8','columns','1:1'),
    JSON_OBJECT('id','station_proposals_create_s6_r9','columns','1:2')
  )
)
WHERE id = 13
  AND JSON_UNQUOTE(JSON_EXTRACT(layout_config, '$.sections[5].id')) = 'station_proposals_create_s6'
  AND NOT JSON_CONTAINS(JSON_EXTRACT(layout_config, '$.sections[5].rows[*].id'), JSON_QUOTE('station_proposals_create_s6_r9'));

-- ===== Form 14 (view/sua): them hang s6_r9 =====
UPDATE forms
SET layout_config = JSON_SET(
  layout_config,
  '$.sections[5].rows', JSON_ARRAY(
    JSON_OBJECT('id','station_proposals_view_s6_r1','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s6_r2','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s6_r3','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s6_r4','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s6_r5','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s6_r6','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s6_r7','columns','1:1'),
    JSON_OBJECT('id','station_proposals_view_s6_r8','columns','1:1'),
    JSON_OBJECT('id','station_proposals_view_s6_r9','columns','1:2')
  )
)
WHERE id = 14
  AND JSON_UNQUOTE(JSON_EXTRACT(layout_config, '$.sections[5].id')) = 'station_proposals_view_s6'
  AND NOT JSON_CONTAINS(JSON_EXTRACT(layout_config, '$.sections[5].rows[*].id'), JSON_QUOTE('station_proposals_view_s6_r9'));

-- ===== Form 13: chuyen 2 field orphan ve hang s6_r9 (giu nguyen neu da dung) =====
UPDATE form_fields ff
JOIN field_definitions fd ON fd.id = ff.field_id
SET ff.config = JSON_SET(ff.config, '$.rowId', 'station_proposals_create_s6_r9', '$.colIndex', 1)
WHERE ff.form_id = 13 AND fd.`key` = 'nq_so_tai_khoan'
  AND JSON_UNQUOTE(JSON_EXTRACT(ff.config, '$.rowId')) <> 'station_proposals_create_s6_r9'
  AND JSON_UNQUOTE(JSON_EXTRACT(ff.config, '$.rowId')) NOT IN (
    'station_proposals_create_s6_r1','station_proposals_create_s6_r2','station_proposals_create_s6_r3',
    'station_proposals_create_s6_r4','station_proposals_create_s6_r5','station_proposals_create_s6_r6',
    'station_proposals_create_s6_r7','station_proposals_create_s6_r8');

UPDATE form_fields ff
JOIN field_definitions fd ON fd.id = ff.field_id
SET ff.config = JSON_SET(ff.config, '$.rowId', 'station_proposals_create_s6_r9', '$.colIndex', 0)
WHERE ff.form_id = 13 AND fd.`key` = 'ngan_hang'
  AND JSON_UNQUOTE(JSON_EXTRACT(ff.config, '$.rowId')) <> 'station_proposals_create_s6_r9'
  AND JSON_UNQUOTE(JSON_EXTRACT(ff.config, '$.rowId')) NOT IN (
    'station_proposals_create_s6_r1','station_proposals_create_s6_r2','station_proposals_create_s6_r3',
    'station_proposals_create_s6_r4','station_proposals_create_s6_r5','station_proposals_create_s6_r6',
    'station_proposals_create_s6_r7','station_proposals_create_s6_r8');

-- ===== Form 14: chuyen 2 field orphan ve hang s6_r9 =====
UPDATE form_fields ff
JOIN field_definitions fd ON fd.id = ff.field_id
SET ff.config = JSON_SET(ff.config, '$.rowId', 'station_proposals_view_s6_r9', '$.colIndex', 1)
WHERE ff.form_id = 14 AND fd.`key` = 'nq_so_tai_khoan'
  AND JSON_UNQUOTE(JSON_EXTRACT(ff.config, '$.rowId')) <> 'station_proposals_view_s6_r9'
  AND JSON_UNQUOTE(JSON_EXTRACT(ff.config, '$.rowId')) NOT IN (
    'station_proposals_view_s6_r1','station_proposals_view_s6_r2','station_proposals_view_s6_r3',
    'station_proposals_view_s6_r4','station_proposals_view_s6_r5','station_proposals_view_s6_r6',
    'station_proposals_view_s6_r7','station_proposals_view_s6_r8');

UPDATE form_fields ff
JOIN field_definitions fd ON fd.id = ff.field_id
SET ff.config = JSON_SET(ff.config, '$.rowId', 'station_proposals_view_s6_r9', '$.colIndex', 0)
WHERE ff.form_id = 14 AND fd.`key` = 'ngan_hang'
  AND JSON_UNQUOTE(JSON_EXTRACT(ff.config, '$.rowId')) <> 'station_proposals_view_s6_r9'
  AND JSON_UNQUOTE(JSON_EXTRACT(ff.config, '$.rowId')) NOT IN (
    'station_proposals_view_s6_r1','station_proposals_view_s6_r2','station_proposals_view_s6_r3',
    'station_proposals_view_s6_r4','station_proposals_view_s6_r5','station_proposals_view_s6_r6',
    'station_proposals_view_s6_r7','station_proposals_view_s6_r8');

-- ===== Kiem tra: phai con 0 field required orphan o form 13/14 =====
SELECT ff.form_id, fd.`key`, fd.label, JSON_UNQUOTE(JSON_EXTRACT(ff.config, '$.rowId')) AS rowId
FROM form_fields ff
JOIN field_definitions fd ON fd.id = ff.field_id
WHERE ff.form_id IN (13,14) AND fd.required = 1
  AND JSON_UNQUOTE(JSON_EXTRACT(ff.config, '$.rowId')) NOT IN (
    SELECT jt.row_id FROM forms f,
    JSON_TABLE(JSON_EXTRACT(f.layout_config, '$.sections[*].rows[*].id'),
      '$[*]' COLUMNS (row_id VARCHAR(100) PATH '$')) AS jt
    WHERE f.id = ff.form_id);
