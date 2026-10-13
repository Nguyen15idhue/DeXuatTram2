-- -*- coding: utf-8 -*-
-- 61: Chuẩn hóa field Users + fix mojibake DataList dm_phong_ban
-- Bước 5 của docs/5/38.ChuanHoaFields3Entity_kehoach.md

-- Fix mojibake tiếng Việt trong dm_phong_ban
UPDATE data_lists
   SET description = 'Danh mục phòng ban',
       columns_config = '[{"key":"ma","label":"Mã","type":"text"},{"key":"ten","label":"Tên phòng ban","type":"text"}]',
       updated_at = NOW()
 WHERE name = 'dm_phong_ban';
