-- -*- coding: utf-8 -*-
-- 63: Mặc định khóa toàn bộ field hiện có (chỉ SUPER_ADMIN mở khóa khi cần sửa)
-- Bước 9 của docs/5/38.ChuanHoaFields3Entity_kehoach.md

UPDATE field_definitions
   SET is_locked = 1, updated_at = NOW()
 WHERE is_locked = 0;
