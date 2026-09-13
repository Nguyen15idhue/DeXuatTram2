-- -*- coding: utf-8 -*-
-- 64: Xóa 3 form legacy purpose='all' (đã thay bằng form create/view)
-- Bước 11 của docs/5/38.ChuanHoaFields3Entity_kehoach.md

DELETE FROM forms WHERE purpose = 'all';
