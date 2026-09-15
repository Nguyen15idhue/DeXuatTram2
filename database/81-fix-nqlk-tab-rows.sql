-- 81: Sua loi off-by-one cua migration 76 (docs/5/42 - P1).
-- Migration 76 append nham index: s1 = sections[0] nen s5 = [4], s6 = [5].
-- 76 da append row LK moi vao sections[5] (= s6 NQ) va row NQ moi vao sections[6] (= s7 Ho so).
-- Migration nay dat lai rows dung cho sections[4] (LK) / [5] (NQ) / [6] (Ho so).
-- Idempotent (gan mang co dinh).

-- ===== Form 13 (create) =====
UPDATE forms
SET layout_config = JSON_SET(
  layout_config,
  '$.sections[4].rows', JSON_ARRAY(
    JSON_OBJECT('id','station_proposals_create_s5_r1','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s5_r2','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s5_r3','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s5_r4','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s5_r5','columns','1:1'),
    JSON_OBJECT('id','station_proposals_create_s5_r6','columns','1:1'),
    JSON_OBJECT('id','station_proposals_create_s5_r7','columns','1:1'),
    JSON_OBJECT('id','station_proposals_create_s5_r8','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s5_r9','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s5_r10','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s5_r11','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s5_r12','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s5_r13','columns','1:1'),
    JSON_OBJECT('id','station_proposals_create_s5_r14','columns','1:1')
  ),
  '$.sections[5].rows', JSON_ARRAY(
    JSON_OBJECT('id','station_proposals_create_s6_r1','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s6_r2','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s6_r3','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s6_r4','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s6_r5','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s6_r6','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s6_r7','columns','1:1'),
    JSON_OBJECT('id','station_proposals_create_s6_r8','columns','1:1')
  ),
  '$.sections[6].rows', JSON_ARRAY(
    JSON_OBJECT('id','station_proposals_create_s7_r1','columns','1:2'),
    JSON_OBJECT('id','station_proposals_create_s7_r2','columns','1:2')
  )
)
WHERE id = 13
  AND JSON_EXTRACT(layout_config, '$.sections[4].id') = 'station_proposals_create_s5'
  AND JSON_EXTRACT(layout_config, '$.sections[5].id') = 'station_proposals_create_s6';

-- ===== Form 14 (view) =====
UPDATE forms
SET layout_config = JSON_SET(
  layout_config,
  '$.sections[4].rows', JSON_ARRAY(
    JSON_OBJECT('id','station_proposals_view_s5_r1','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s5_r2','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s5_r3','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s5_r4','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s5_r5','columns','1:1'),
    JSON_OBJECT('id','station_proposals_view_s5_r6','columns','1:1'),
    JSON_OBJECT('id','station_proposals_view_s5_r7','columns','1:1'),
    JSON_OBJECT('id','station_proposals_view_s5_r8','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s5_r9','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s5_r10','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s5_r11','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s5_r12','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s5_r13','columns','1:1'),
    JSON_OBJECT('id','station_proposals_view_s5_r14','columns','1:1')
  ),
  '$.sections[5].rows', JSON_ARRAY(
    JSON_OBJECT('id','station_proposals_view_s6_r1','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s6_r2','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s6_r3','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s6_r4','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s6_r5','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s6_r6','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s6_r7','columns','1:1'),
    JSON_OBJECT('id','station_proposals_view_s6_r8','columns','1:1')
  ),
  '$.sections[6].rows', JSON_ARRAY(
    JSON_OBJECT('id','station_proposals_view_s7_r1','columns','1:2'),
    JSON_OBJECT('id','station_proposals_view_s7_r2','columns','1:2')
  )
)
WHERE id = 14
  AND JSON_EXTRACT(layout_config, '$.sections[4].id') = 'station_proposals_view_s5'
  AND JSON_EXTRACT(layout_config, '$.sections[5].id') = 'station_proposals_view_s6';

SELECT 'fixed_13' AS metric, JSON_EXTRACT(layout_config,'$.sections[4].rows[*].id') AS lk, JSON_EXTRACT(layout_config,'$.sections[5].rows[*].id') AS nq FROM forms WHERE id=13;
SELECT 'fixed_14' AS metric, JSON_EXTRACT(layout_config,'$.sections[4].rows[*].id') AS lk, JSON_EXTRACT(layout_config,'$.sections[5].rows[*].id') AS nq FROM forms WHERE id=14;
